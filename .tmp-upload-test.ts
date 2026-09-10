import 'dotenv/config';
import axios from 'axios';
import FormData from 'form-data';
import { readFileSync } from 'fs';

// Exercises the real HTTP route end-to-end: auth, multer, validation, the
// returned URL, and that the file is then actually served back with the right
// headers.
const API = 'http://localhost:4000/api';
const PDF = process.argv[2];

(async () => {
  const login = await axios.post(`${API}/auth/login`, {
    email: 'admin@cocojojochem.com',
    password: 'Password123@',
  });
  const token = login.data.accessToken;
  console.log('logged in as admin');

  const form = new FormData();
  form.append('file', readFileSync(PDF), { filename: 'COA-Lot-2291.pdf', contentType: 'application/pdf' });

  const res = await axios.post(`${API}/uploads/product-document`, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
  });
  console.log('upload response:', JSON.stringify(res.data, null, 1));

  const url = res.data.data.url;
  const fetched = await axios.get(url, { responseType: 'arraybuffer' });
  console.log('\nserved back from', url);
  console.log('  status              :', fetched.status);
  console.log('  content-type        :', fetched.headers['content-type']);
  console.log('  content-disposition :', fetched.headers['content-disposition']);
  console.log('  x-content-type-opts :', fetched.headers['x-content-type-options']);
  console.log('  bytes               :', fetched.data.length);
  console.log('  is a real PDF       :', Buffer.from(fetched.data).slice(0, 5).toString());

  // A rejected type must not be written.
  try {
    const bad = new FormData();
    bad.append('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.svg', contentType: 'image/svg+xml' });
    await axios.post(`${API}/uploads/product-document`, bad, {
      headers: { ...bad.getHeaders(), Authorization: `Bearer ${token}` },
    });
    console.log('\nSVG upload: NOT REJECTED — problem!');
  } catch (e: any) {
    console.log('\nSVG upload correctly rejected:', e.response?.status, e.response?.data?.message);
  }

  // Unauthenticated upload must fail.
  try {
    const anon = new FormData();
    anon.append('file', readFileSync(PDF), { filename: 'x.pdf', contentType: 'application/pdf' });
    await axios.post(`${API}/uploads/product-document`, anon, { headers: anon.getHeaders() });
    console.log('anonymous upload: NOT REJECTED — problem!');
  } catch (e: any) {
    console.log('anonymous upload correctly rejected:', e.response?.status);
  }

  console.log('\nDOC_URL=' + url);
})().catch((e) => {
  console.error('FAILED:', e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
