import { pdf } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { registerPdfFonts } from './register-fonts'

/**
 * Renders a react-pdf document to a Buffer.
 *
 * `toBuffer()` is typed as returning a Node readable stream and does so at
 * runtime, so it has to be drained before the route handler can hand it to
 * NextResponse — passing the stream straight through works only by accident of
 * casting and breaks under the edge/web-stream body types.
 */
export async function renderPdfToBuffer(doc: ReactElement): Promise<Buffer> {
  // Every document is typeset in IBM Plex Sans, so this is the one choke point
  // that has to guarantee the family exists before the reconciler runs.
  registerPdfFonts()

  // `pdf()` demands an element typed with the props of <Document> itself, which
  // a wrapper component that *renders* a Document never satisfies. The cast is
  // confined here so the call sites stay ordinary React.
  const result = await pdf(doc as ReactElement<DocumentProps>).toBuffer()

  // Tests (and any future renderer version) may hand back a Buffer directly.
  if (Buffer.isBuffer(result)) return result

  const chunks: Buffer[] = []
  for await (const chunk of result as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}
