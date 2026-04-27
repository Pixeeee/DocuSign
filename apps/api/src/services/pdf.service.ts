import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import { rsaSign } from '@esign/crypto'
import { sha3HashFile } from '@esign/crypto'

export interface SignaturePosition {
  page: number    // 1-indexed
  x: number       // from left
  y: number       // from bottom
  width?: number
  height?: number
}

export interface SignatureMeta {
  signerName: string
  signerEmail: string
  signedAt: Date
  ipAddress: string
  documentId: string
  signatureId: string
}

/**
 * Embed visual signature onto PDF and return signed buffer
 */
export async function embedSignatureOnPdf(
  pdfBuffer: Buffer,
  position: SignaturePosition,
  meta: SignatureMeta,
  signatureImageBase64?: string
): Promise<{
  signedBuffer: Buffer
  sha3Hash: string
  rsaSignature: string
}> {
  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const pages = pdfDoc.getPages()

  if (position.page < 1 || position.page > pages.length) {
    throw new Error(`Invalid page number: ${position.page}`)
  }

  const page = pages[position.page - 1]
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const { width: pageWidth, height: pageHeight } = page.getSize()

  // ── Draw signature box ──────────────────────────────────────

  const boxW = position.width || 200
  const boxH = position.height || 80
  const boxX = Math.max(0, Math.min(position.x, pageWidth - boxW))
  const boxY = Math.max(0, Math.min(position.y, pageHeight - boxH))

  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    borderColor: rgb(0.2, 0.4, 0.8),
    borderWidth: 1.5,
    color: rgb(0.95, 0.97, 1),
  })

  // ── Embed signature image if provided ──────────────────────

  if (signatureImageBase64) {
    const sigBuffer = Buffer.from(
      signatureImageBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    )
    const sigImage = await pdfDoc.embedPng(sigBuffer).catch(() =>
      pdfDoc.embedJpg(sigBuffer)
    )
    page.drawImage(sigImage, {
      x: boxX + 10,
      y: boxY + 20,
      width: boxW - 20,
      height: boxH - 35,
    })
  } else {
    // Text signature fallback
    page.drawText(meta.signerName, {
      x: boxX + 10,
      y: boxY + boxH / 2,
      size: 16,
      font,
      color: rgb(0, 0, 0.6),
    })
  }

  // ── Signature metadata text ─────────────────────────────────

  const timestamp = meta.signedAt.toUTCString()
  page.drawText(`Signed by: ${meta.signerName} (${meta.signerEmail})`, {
    x: boxX + 5,
    y: boxY + 8,
    size: 6,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  page.drawText(`Date: ${timestamp}`, {
    x: boxX + 5,
    y: boxY + 2,
    size: 5,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  // ── Watermark on all pages ──────────────────────────────────

  for (const p of pages) {
    const { width, height } = p.getSize()
    p.drawText('DIGITALLY SIGNED', {
      x: width / 2 - 80,
      y: height / 2,
      size: 40,
      font,
      color: rgb(0.9, 0.9, 0.9),
      opacity: 0.15,
      rotate: degrees(45),
    })
  }

  // ── Add PDF metadata ────────────────────────────────────────

  pdfDoc.setTitle(`Signed Document - ${meta.documentId}`)
  pdfDoc.setAuthor(meta.signerName)
  pdfDoc.setSubject('Electronically Signed Document')
  pdfDoc.setKeywords(['esign', 'signed', meta.signatureId])
  pdfDoc.setProducer('ESIGN Platform v1.0')
  pdfDoc.setCreationDate(meta.signedAt)
  pdfDoc.setModificationDate(meta.signedAt)
  if (typeof (pdfDoc as any).setCustomMetadata === 'function') {
    (pdfDoc as any).setCustomMetadata('SignatureId', meta.signatureId)
    (pdfDoc as any).setCustomMetadata('SignerEmail', meta.signerEmail)
    (pdfDoc as any).setCustomMetadata('IPAddress', meta.ipAddress)
  }

  // ── Serialize and hash ──────────────────────────────────────

  const signedBuffer = Buffer.from(await pdfDoc.save())
  const sha3Hash = sha3HashFile(signedBuffer)

  // RSA sign the document hash
  const rsaSignature = rsaSign(sha3Hash)

  return { signedBuffer, sha3Hash, rsaSignature }
}

/**
 * Validate PDF is not corrupted
 */
export async function validatePdf(buffer: Buffer): Promise<boolean> {
  try {
    await PDFDocument.load(buffer)
    return true
  } catch {
    return false
  }
}

/**
 * Get PDF page count
 */
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(buffer)
  return pdf.getPageCount()
}
