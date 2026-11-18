import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Universal print trigger for both desktop browsers and Android WebView / Companion App.
 * In Android Companion App, routes through AndroidBridge to invoke Android's native PrintManager.
 * In standard browsers, directly triggers window.print().
 */
export function triggerNativePrint(documentTitle?: string): void {
  const originalTitle = document.title;
  if (documentTitle) {
    document.title = documentTitle;
  }

  const androidBridge = (window as any).AndroidBridge;
  if (androidBridge && typeof androidBridge.print === 'function') {
    androidBridge.print();
    if (documentTitle) {
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    }
    return;
  }

  // Fallback to standard window.print()
  try {
    window.print();
  } catch (err) {
    console.warn('Native window.print() failed:', err);
  } finally {
    if (documentTitle) {
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    }
  }
}

/**
 * Generates an A4 PDF from a DOM element and triggers direct file download.
 * Works reliably on Android WebView, iOS Safari, PWA, and desktop browsers.
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  const safeName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.98);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  const pageHeight = pdf.internal.pageSize.getHeight();

  // If content fits within one A4 page or extends, render cleanly
  if (pdfHeight <= pageHeight) {
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  } else {
    // Multi-page slicing if document spans multiple A4 pages
    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }
  }

  pdf.save(safeName);
}

/**
 * Generates a PDF and opens the native mobile share sheet (WhatsApp, Drive, Print, etc.).
 * Falls back to direct PDF download if Web Share API is not supported.
 */
export async function shareElementAsPdf(
  element: HTMLElement,
  fileName: string,
  shareTitle: string,
  shareText?: string
): Promise<void> {
  const safeName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.98);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

  const pdfBlob = pdf.output('blob');
  const pdfFile = new File([pdfBlob], safeName, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({
        files: [pdfFile],
        title: shareTitle,
        text: shareText || shareTitle,
      });
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') return; // User closed share sheet
      console.warn('Share failed, falling back to download:', err);
    }
  }

  // Fallback: direct download
  pdf.save(safeName);
}
