/* Dev-only: builds workspace/sample-matter/05-harbor-production.pdf (fictional).
   Pages 1-3 carry a text layer; page 4 is an image-only "scan" with a Bates overlay. */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const out = process.argv[2] || 'workspace/sample-matter/05-harbor-production.pdf';

const pages = [
  { bates: 'HARBOR_000401', title: 'HARBOR LOGISTICS, INC. - RECEIVING LOG (SAMPLE, FICTIONAL)', lines: [
    'Date: January 22, 2026',
    '07:40 Inbound PO 44817 from Cinder Freight Co. received at Dock 3.',
    'Pallets 3 and 7 crushed on arrival; shrink wrap torn; product exposed.',
    'Photographs taken by receiving clerk T. Alvarez at 07:52.',
    'Shipment logged as non-conforming and quarantined pending inspection.',
    'Clerk signature: T. Alvarez',
  ] },
  { bates: 'HARBOR_000402', title: 'NOTICE OF DEFECT', lines: [
    'Date: January 29, 2026',
    'To: Cinder Freight Co., Attn: D. Okafor',
    'Re: PO 44817 - Notice of Defect under Section 9.2',
    'Harbor Logistics gives notice that the January 22, 2026 shipment',
    'under PO 44817 was non-conforming. Pallets 3 and 7 arrived crushed.',
    'This notice is given within seven days of delivery as required by Section 9.2.',
    'Harbor reserves all rights under the Master Services Agreement.',
  ] },
  { bates: 'HARBOR_000403', title: 'MAILROOM LOG - INBOUND (SAMPLE, FICTIONAL)', lines: [
    'January 6, 2026 - FedEx, from Atlas Packaging, invoice',
    'January 8, 2026 - USPS first-class, from Cinder Freight Co., rate notice dated December 15, 2025',
    'January 8, 2026 - routed to Accounts Payable (M. Chen)',
    'January 12, 2026 - UPS, from Granite Supply, catalog',
    'Note: envelope for the Cinder rate notice is postmarked January 5, 2026',
  ] },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1275, height: 1650 } });
  await page.setContent(`<body style="margin:0;background:#d9d4c7"><div id="r" style="width:1275px;height:1650px;display:flex;align-items:flex-start;justify-content:center;padding-top:120px;box-sizing:border-box">
    <div style="transform:rotate(-1.3deg);width:980px;background:#f4f0e4;padding:60px 70px;font:30px/1.55 'Courier New',monospace;color:#2a2a2a;box-shadow:0 0 0 2px #bbb;filter:contrast(1.1) blur(0.4px)">
      <div style="font-weight:bold;font-size:38px;letter-spacing:2px">CINDER FREIGHT CO.</div>
      <div style="font-weight:bold">DELIVERY RECEIPT No. 88213</div><br>
      <div>Delivered: 01/22/2026 08:15</div>
      <div>Consignee: Harbor Logistics, Dock 3</div>
      <div>PO: 44817 &nbsp; Pallets: 12</div>
      <div>Exceptions: PALLETS 3 + 7 DAMAGED</div><br>
      <div>Received by: <span style="font-family:cursive;font-size:36px">T. Alvarez</span></div>
      <div>Driver: <span style="font-family:cursive;font-size:36px">R. Mendes</span></div>
    </div></div></body>`);
  const png = await page.locator('#r').screenshot({ type: 'png' });
  await browser.close();

  const doc = await PDFDocument.create();
  doc.setTitle('Harbor Logistics production HARBOR_000401-000404 (sample, fictional)');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const p of pages) {
    const pg = doc.addPage([612, 792]);
    pg.drawText(p.title, { x: 54, y: 720, size: 12, font: bold });
    p.lines.forEach((l, i) => pg.drawText(l, { x: 54, y: 690 - i * 22, size: 11, font }));
    pg.drawText(p.bates, { x: 470, y: 30, size: 9, font: bold, color: rgb(0.15, 0.15, 0.15) });
  }
  const img = await doc.embedPng(png);
  const scan = doc.addPage([612, 792]);
  scan.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  scan.drawText('HARBOR_000404', { x: 470, y: 30, size: 9, font: bold });
  writeFileSync(out, await doc.save());
  console.log('wrote', out);
})().catch((e) => { console.error(e); process.exit(1); });
