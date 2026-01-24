import jsPDF from 'jspdf';
import type { Invoice, InvoiceLine, Contact } from '../domain/types';

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  taxId?: string;
}

/**
 * Generate a PDF invoice
 */
export function generateInvoicePDF(
  invoice: Invoice,
  invoiceLines: InvoiceLine[],
  customer: Contact,
  companyInfo: CompanyInfo
): jsPDF {
  const doc = new jsPDF();
  
  // Set up fonts and colors
  const primaryColor: [number, number, number] = [52, 152, 219]; // #3498db
  const textColor: [number, number, number] = [44, 62, 80]; // #2c3e50
  const grayColor: [number, number, number] = [149, 165, 166]; // #95a5a6
  
  let yPos = 20;
  
  // Company Header
  doc.setFontSize(24);
  doc.setTextColor(...primaryColor);
  doc.text(companyInfo.name, 20, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setTextColor(...grayColor);
  if (companyInfo.address) {
    doc.text(companyInfo.address, 20, yPos);
    yPos += 5;
  }
  if (companyInfo.phone || companyInfo.email) {
    const contactLine = [companyInfo.phone, companyInfo.email].filter(Boolean).join(' | ');
    doc.text(contactLine, 20, yPos);
    yPos += 5;
  }
  if (companyInfo.taxId) {
    doc.text(`Tax ID: ${companyInfo.taxId}`, 20, yPos);
  }
  
  // Invoice Title and Number
  yPos = 20;
  doc.setFontSize(28);
  doc.setTextColor(...textColor);
  doc.text('INVOICE', 120, yPos, { align: 'right' });
  yPos += 10;
  
  doc.setFontSize(12);
  doc.text(invoice.invoice_number, 120, yPos, { align: 'right' });
  yPos += 10;
  
  // Status badge (if void or paid)
  if (invoice.status === 'void') {
    doc.setFontSize(20);
    doc.setTextColor(200, 0, 0);
    doc.text('VOID', 120, yPos, { align: 'right' });
  } else if (invoice.status === 'paid') {
    doc.setFontSize(20);
    doc.setTextColor(39, 174, 96);
    doc.text('PAID', 120, yPos, { align: 'right' });
  }
  
  // Reset position for customer info
  yPos = 50;
  
  // Customer Information
  doc.setFontSize(11);
  doc.setTextColor(...textColor);
  doc.text('Bill To:', 20, yPos);
  yPos += 7;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(customer.name, 20, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  
  doc.setFontSize(10);
  if (customer.address) {
    doc.text(customer.address, 20, yPos);
    yPos += 5;
  }
  if (customer.email) {
    doc.text(customer.email, 20, yPos);
    yPos += 5;
  }
  if (customer.phone) {
    doc.text(customer.phone, 20, yPos);
  }
  
  // Invoice dates (right side)
  yPos = 50;
  doc.setFontSize(10);
  doc.setTextColor(...grayColor);
  doc.text('Issue Date:', 130, yPos);
  doc.setTextColor(...textColor);
  doc.text(formatDate(invoice.issue_date), 170, yPos, { align: 'right' });
  yPos += 6;
  
  doc.setTextColor(...grayColor);
  doc.text('Due Date:', 130, yPos);
  doc.setTextColor(...textColor);
  doc.text(formatDate(invoice.due_date), 170, yPos, { align: 'right' });
  
  // Line Items Table
  yPos = 90;
  
  // Table header
  doc.setFillColor(236, 240, 241); // #ecf0f1
  doc.rect(20, yPos - 5, 170, 8, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...textColor);
  doc.text('Description', 25, yPos);
  doc.text('Qty', 130, yPos, { align: 'right' });
  doc.text('Price', 150, yPos, { align: 'right' });
  doc.text('Amount', 185, yPos, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  yPos += 10;
  
  // Table rows
  for (const line of invoiceLines) {
    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(10);
    doc.text(line.description, 25, yPos, { maxWidth: 100 });
    doc.text(line.quantity.toString(), 130, yPos, { align: 'right' });
    doc.text(formatCurrency(line.unit_price), 150, yPos, { align: 'right' });
    doc.text(formatCurrency(line.amount), 185, yPos, { align: 'right' });
    
    yPos += 8;
  }
  
  // Totals section
  yPos += 5;
  const totalsX = 130;
  
  doc.setDrawColor(...grayColor);
  doc.line(totalsX, yPos, 190, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setTextColor(...grayColor);
  doc.text('Subtotal:', totalsX, yPos);
  doc.setTextColor(...textColor);
  doc.text(formatCurrency(invoice.subtotal), 185, yPos, { align: 'right' });
  yPos += 6;
  
  doc.setTextColor(...grayColor);
  doc.text('Tax (13% HST):', totalsX, yPos);
  doc.setTextColor(...textColor);
  doc.text(formatCurrency(invoice.tax_amount), 185, yPos, { align: 'right' });
  yPos += 8;
  
  doc.setDrawColor(...textColor);
  doc.setLineWidth(0.5);
  doc.line(totalsX, yPos, 190, yPos);
  yPos += 8;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...textColor);
  doc.text('Total:', totalsX, yPos);
  doc.text(formatCurrency(invoice.total_amount), 185, yPos, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  
  // Payment info if partially or fully paid
  if (invoice.paid_amount > 0) {
    yPos += 8;
    doc.setFontSize(10);
    doc.setTextColor(39, 174, 96); // Green
    doc.text('Paid:', totalsX, yPos);
    doc.text(formatCurrency(invoice.paid_amount), 185, yPos, { align: 'right' });
    yPos += 6;
    
    doc.setTextColor(231, 76, 60); // Red
    doc.text('Balance Due:', totalsX, yPos);
    doc.text(formatCurrency(invoice.total_amount - invoice.paid_amount), 185, yPos, { align: 'right' });
  }
  
  // Notes section (if any)
  if (invoice.notes) {
    yPos += 15;
    
    // Check if we need a new page
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(10);
    doc.setTextColor(...grayColor);
    doc.text('Notes:', 20, yPos);
    yPos += 6;
    
    doc.setTextColor(...textColor);
    const splitNotes = doc.splitTextToSize(invoice.notes, 170);
    doc.text(splitNotes, 20, yPos);
  }
  
  // Footer
  const footerY = 280;
  doc.setFontSize(8);
  doc.setTextColor(...grayColor);
  doc.text('Thank you for your business!', 105, footerY, { align: 'center' });
  
  return doc;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
