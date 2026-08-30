async function fetchVercelScripts() {
  const pages = ['/', '/chat', '/saved'];
  const allScripts = new Set();

  for (const page of pages) {
    console.log(`\nFetching HTML for https://campus-stranger.vercel.app${page} ...`);
    const res = await fetch(`https://campus-stranger.vercel.app${page}`);
    console.log(`HTTP ${res.status}`);
    const html = await res.text();

    const scriptMatches = html.match(/src="(\/_next\/static\/[^"]+)"/g) || [];
    for (const m of scriptMatches) {
      const path = m.replace('src="', '').replace('"', '');
      allScripts.add(path);
    }
  }

  console.log(`\nTotal unique JS bundles found: ${allScripts.size}`);
  for (const src of allScripts) {
    const fullUrl = `https://campus-stranger.vercel.app${src}`;
    const sRes = await fetch(fullUrl);
    const text = await sRes.text();
    if (text.includes('mock-link')) {
      console.log(`\n🚨 FOUND 'mock-link' in bundle: ${src}`);
      const idx = text.indexOf('mock-link');
      console.log(`Context: ${text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 150))}`);
    } else {
      console.log(`✅ Clean (no mock-link): ${src}`);
    }
  }
}

fetchVercelScripts().catch(console.error);
