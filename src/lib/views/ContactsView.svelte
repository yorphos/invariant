<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import type { Contact } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Modal from '../ui/Modal.svelte';
  import Table from '../ui/Table.svelte';

  let contacts: Contact[] = [];
  let loading = true;
  let showModal = false;
  let editingContact: Contact | null = null;

  // Form fields
  let formType: 'customer' | 'vendor' | 'both' = 'customer';
  let formName = '';
  let formEmail = '';
  let formPhone = '';
  let formAddress = '';
  let formTaxId = '';
  
  // Dynamic type options based on existing transactions
  let availableTypeOptions: Array<{ value: string; label: string }> = [
    { value: 'customer', label: 'Customer' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'both', label: 'Both' }
  ];

  onMount(async () => {
    await loadContacts();
  });

  async function loadContacts() {
    loading = true;
    try {
      contacts = await persistenceService.getContacts();
    } catch (e) {
      console.error('Failed to load contacts:', e);
    }
    loading = false;
  }

  function openCreateModal() {
    editingContact = null;
    formType = 'customer';
    formName = '';
    formEmail = '';
    formPhone = '';
    formAddress = '';
    formTaxId = '';
    // For new contacts, all options are available
    availableTypeOptions = [
      { value: 'customer', label: 'Customer' },
      { value: 'vendor', label: 'Vendor' },
      { value: 'both', label: 'Both' }
    ];
    showModal = true;
  }

  async function openEditModal(contact: Contact) {
    editingContact = contact;
    formType = contact.type;
    formName = contact.name;
    formEmail = contact.email || '';
    formPhone = contact.phone || '';
    formAddress = contact.address || '';
    formTaxId = contact.tax_id || '';
    
    // Load available type options based on transactions
    if (contact.id !== undefined) {
      try {
        const availableTypes = await persistenceService.getAvailableContactTypes(contact.id);
        availableTypeOptions = availableTypes.map((type: 'customer' | 'vendor' | 'both') => ({
          value: type,
          label: type.charAt(0).toUpperCase() + type.slice(1)
        }));
        
        // Ensure current type is selected even if not in available options (shouldn't happen, but safety)
        if (!availableTypes.includes(contact.type)) {
          formType = 'both'; // Default to 'both' which is always available
        }
      } catch (e) {
        console.error('Failed to load available contact types:', e);
        // Fallback to all options
        availableTypeOptions = [
          { value: 'customer', label: 'Customer' },
          { value: 'vendor', label: 'Vendor' },
          { value: 'both', label: 'Both' }
        ];
      }
    }
    
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingContact = null;
  }

  async function handleSubmit() {
    try {
      const contactData = {
        type: formType,
        name: formName,
        email: formEmail || undefined,
        phone: formPhone || undefined,
        address: formAddress || undefined,
        tax_id: formTaxId || undefined,
        is_active: true,
      };

      if (editingContact && editingContact.id !== undefined) {
        // Update existing contact
        await persistenceService.updateContact(editingContact.id, contactData);
      } else {
        // Create new contact
        await persistenceService.createContact(contactData);
      }
      
      await loadContacts();
      closeModal();
    } catch (e) {
      console.error('Failed to save contact:', e);
      alert('Failed to save contact: ' + e);
    }
  }
</script>

<div class="contacts-view">
  <div class="header">
    <h2>Contacts</h2>
    <Button on:click={openCreateModal}>
      + New Contact
    </Button>
  </div>

  {#if loading}
    <Card>
      <p>Loading contacts...</p>
    </Card>
  {:else if contacts.length === 0}
    <Card>
      <p>No contacts yet. Click "New Contact" to add your first customer or vendor.</p>
    </Card>
  {:else}
    <Card padding={false}>
      <Table headers={['Name', 'Type', 'Email', 'Phone', 'Tax ID']}>
        {#each contacts as contact}
          <tr class="clickable-row" on:click={() => openEditModal(contact)}>
            <td>{contact.name}</td>
            <td>
              <span class="badge {contact.type}">{contact.type}</span>
            </td>
            <td>{contact.email || '-'}</td>
            <td>{contact.phone || '-'}</td>
            <td>{contact.tax_id || '-'}</td>
          </tr>
        {/each}
      </Table>
    </Card>
  {/if}
</div>

<Modal open={showModal} title={editingContact ? "Edit Contact" : "New Contact"} onClose={closeModal}>
  <form on:submit|preventDefault={handleSubmit}>
    <Select
      label="Type"
      bind:value={formType}
      required
      options={availableTypeOptions}
    />

    <Input
      label="Name"
      bind:value={formName}
      required
      placeholder="Enter contact name"
    />

    <Input
      type="email"
      label="Email"
      bind:value={formEmail}
      placeholder="contact@example.com"
    />

    <Input
      type="tel"
      label="Phone"
      bind:value={formPhone}
      placeholder="(555) 123-4567"
    />

    <Input
      label="Address"
      bind:value={formAddress}
      placeholder="Full address"
    />

    <Input
      label="Tax ID"
      bind:value={formTaxId}
      placeholder="Business number or tax ID"
    />

    <div class="modal-actions">
      <Button variant="ghost" on:click={closeModal}>
        Cancel
      </Button>
      <Button type="submit">
        {editingContact ? 'Update Contact' : 'Create Contact'}
      </Button>
    </div>
  </form>
</Modal>

<style>
  .contacts-view {
    max-width: 1200px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .header h2 {
    margin: 0;
    color: #2c3e50;
    font-size: 28px;
  }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .clickable-row {
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .clickable-row:hover {
    background-color: #f8f9fa;
  }

  .badge.customer {
    background: #e8f4f8;
    color: #2980b9;
  }

  .badge.vendor {
    background: #fef5e7;
    color: #d68910;
  }

  .badge.both {
    background: #f4ecf7;
    color: #7d3c98;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #ecf0f1;
  }
</style>
