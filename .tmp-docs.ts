import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { UploadService } from './src/modules/upload/upload.service';
import { ProductsService } from './src/modules/products/products.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product, ProductDocument, DocType } from './src/entities';
import { Repository } from 'typeorm';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        expected ${e}\n        actual   ${a}`);
  }
}

const fakeFile = (originalname: string, mimetype: string, size = 1000) =>
  ({ originalname, mimetype, size } as Express.Multer.File);

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const uploads = app.get(UploadService);
  const products = app.get(ProductsService);
  const productsRepo = app.get<Repository<Product>>(getRepositoryToken(Product));
  const docsRepo = app.get<Repository<ProductDocument>>(getRepositoryToken(ProductDocument));

  function accepts(label: string, file: Express.Multer.File, shouldPass: boolean) {
    try {
      uploads.validateDocumentFile(file);
      if (shouldPass) {
        pass++;
        console.log(`  PASS  ${label} — accepted`);
      } else {
        fail++;
        console.log(`  FAIL  ${label} — accepted but should have been REJECTED`);
      }
    } catch (e: any) {
      if (!shouldPass) {
        pass++;
        console.log(`  PASS  ${label} — rejected: ${e.message}`);
      } else {
        fail++;
        console.log(`  FAIL  ${label} — rejected but should have passed: ${e.message}`);
      }
    }
  }

  console.log('\n=== 1) file type validation ===');
  accepts('PDF', fakeFile('coa-lot-2291.pdf', 'application/pdf'), true);
  accepts('DOCX', fakeFile('spec.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), true);
  accepts('XLSX', fakeFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), true);
  accepts('CSV', fakeFile('lots.csv', 'text/csv'), true);
  accepts('JPG scan', fakeFile('cert-scan.jpg', 'image/jpeg'), true);
  accepts('JPEG alt extension', fakeFile('cert.jpeg', 'image/jpeg'), true);
  accepts('PNG scan', fakeFile('cert.png', 'image/png'), true);

  console.log('\n--- must be rejected ---');
  // SVG is an image but can carry <script> and is served same-origin.
  accepts('SVG (script vector)', fakeFile('logo.svg', 'image/svg+xml'), false);
  accepts('HTML', fakeFile('evil.html', 'text/html'), false);
  accepts('EXE', fakeFile('setup.exe', 'application/x-msdownload'), false);
  accepts('JS', fakeFile('x.js', 'application/javascript'), false);
  // The browser supplies the mimetype, so a direct API call can lie about it.
  accepts('HTML disguised as PDF (mismatched ext)', fakeFile('evil.html', 'application/pdf'), false);
  accepts('PDF mimetype, .exe extension', fakeFile('payload.exe', 'application/pdf'), false);
  accepts('no extension at all', fakeFile('coa', 'application/pdf'), false);
  accepts('oversized 20MB PDF', fakeFile('huge.pdf', 'application/pdf', 20 * 1024 * 1024), false);
  accepts('15MB PDF (at the limit)', fakeFile('big.pdf', 'application/pdf', 15 * 1024 * 1024), true);

  console.log('\n=== 2) persistence through the product service ===');
  const target = await productsRepo.findOne({ where: {}, order: { id: 'ASC' } });
  if (!target) {
    console.log('no product to test with');
    process.exit(1);
  }
  const originalDocs = await docsRepo.find({ where: { productId: target.id } });
  console.log(`  using product #${target.id} "${target.name}" (had ${originalDocs.length} docs)`);

  try {
    await products.update(target.id, {
      documents: [
        { url: '/uploads/documents/file-1-coa.pdf', type: DocType.COA, label: 'COA Lot 2291' },
        { url: '/uploads/documents/file-2-sds.pdf', type: DocType.SDS, label: 'Safety Data Sheet' },
      ],
    } as any);

    const saved = await docsRepo.find({ where: { productId: target.id }, order: { id: 'ASC' } });
    check('two documents saved', saved.length, 2);
    check('type persisted', saved[0]?.type, 'COA');
    check('label persisted', saved[0]?.label, 'COA Lot 2291');

    // The cover image must be untouched by a documents-only update.
    const afterUpdate = await productsRepo.findOne({ where: { id: target.id } });
    check('cover imageUrl unchanged by a documents update', afterUpdate!.imageUrl, target.imageUrl);

    console.log('\n=== 3) an omitted key must NOT wipe the documents ===');
    await products.update(target.id, { brand: target.brand || 'Test' } as any);
    check('documents survive an unrelated update', (await docsRepo.count({ where: { productId: target.id } })), 2);

    console.log('\n=== 4) an explicit empty array clears them ===');
    await products.update(target.id, { documents: [] } as any);
    check('documents cleared', await docsRepo.count({ where: { productId: target.id } }), 0);

    console.log('\n=== 5) documents are returned on the public product query ===');
    await products.update(target.id, {
      documents: [{ url: '/uploads/documents/file-1-coa.pdf', type: DocType.COA, label: 'COA Lot 2291' }],
    } as any);
    const publicView: any = await products.findBySlug(target.slug);
    check('public payload includes documents', Array.isArray(publicView?.documents), true);
    check('one document exposed', publicView?.documents?.length, 1);
    check('url exposed', publicView?.documents?.[0]?.url, '/uploads/documents/file-1-coa.pdf');
  } finally {
    console.log('\n=== restoring ===');
    await docsRepo.delete({ productId: target.id });
    if (originalDocs.length) {
      await docsRepo.save(originalDocs.map((d) => docsRepo.create({ ...d })));
    }
    const now = await docsRepo.count({ where: { productId: target.id } });
    console.log(`  product #${target.id} documents restored to ${now} (was ${originalDocs.length})`);
    console.log(`\n${pass} passed, ${fail} failed\n`);
    await app.close();
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
