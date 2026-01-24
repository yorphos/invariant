use tauri::State;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// We'll store database connections in Tauri's managed state
pub struct DbState {
    // Map of connection URLs to their instances
    pub connections: Mutex<std::collections::HashMap<String, sqlx::SqlitePool>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransactionStep {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct TransactionResult {
    pub success: bool,
    pub error: Option<String>,
}

/// Execute multiple SQL statements in a transaction
#[tauri::command]
pub async fn execute_transaction(
    db_url: String,
    steps: Vec<TransactionStep>,
    state: State<'_, DbState>,
) -> Result<TransactionResult, String> {
    // Check if pool exists (without awaiting inside lock)
    let pool = {
        let connections_guard = state.connections.lock().unwrap();
        connections_guard.get(&db_url).cloned()
    };

    // Get or create pool
    let pool = if let Some(existing_pool) = pool {
        existing_pool
    } else {
        // Create new pool outside of lock
        let new_pool = sqlx::SqlitePool::connect(&db_url)
            .await
            .map_err(|e| format!("Failed to connect to database: {}", e))?;
        
        // Store it
        {
            let mut connections_guard = state.connections.lock().unwrap();
            connections_guard.insert(db_url.clone(), new_pool.clone());
        }
        
        new_pool
    };

    // Begin transaction
    let mut tx = pool.begin().await.map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Execute all steps
    for step in steps {
        let mut query = sqlx::query(&step.sql);
        
        // Bind parameters
        for param in step.params {
            query = match param {
                serde_json::Value::String(s) => query.bind(s),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        query.bind(i)
                    } else if let Some(f) = n.as_f64() {
                        query.bind(f)
                    } else {
                        return Err("Invalid number type".to_string());
                    }
                }
                serde_json::Value::Bool(b) => query.bind(b),
                serde_json::Value::Null => query.bind(None::<String>),
                _ => return Err("Unsupported parameter type".to_string()),
            };
        }

        // Execute the query
        query.execute(&mut *tx).await.map_err(|e| {
            format!("SQL Error: {} | Query: {}", e, step.sql)
        })?;
    }

    // Commit transaction
    tx.commit().await.map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(TransactionResult {
        success: true,
        error: None,
    })
}
