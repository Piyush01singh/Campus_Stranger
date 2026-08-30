async function checkVercelOnce() {
  const pages = ['/', '/chat', '/saved'];
  const allScripts = new Set();

  for (const page of pages) {
    const res = await fetch(`https://campus-stranger.vercel.app${page}`);
    if (!res.ok) continue;
    const html = await res.text();

    const scriptMatches = html.match(/src="(\/_next\/static\/[^"]+)"/g) || [];
    for (const m of scriptMatches) {
      const path = m.replace('src="', '').replace('"', '');
      allScripts.add(path);
    }
  }

  let mockFound = false;
  let mockLocation = null;

  for (const src of allScripts) {
    const fullUrl = `https://campus-stranger.vercel.app${src}`;
    const sRes = await fetch(fullUrl);
    const text = await sRes.text();
    if (text.includes('mock-link')) {
      mockFound = true;
      mockLocation = src;
      break;
    }
  }

  return { totalScripts: allScripts.size, mockFound, mockLocation };
}

async function pollUntilClean() {
  console.log('================================================================');
  console.log('  Monitoring Vercel Deployment for Clean Elimination of mock-link');
  console.log('================================================================\n');

  for (let attempt = 1; attempt <= 20; attempt++) {
    const status = await checkVercelOnce();
    const now = new Date().toISOString();
    if (!status.mockFound) {
      console.log(`[${now}] 🎉 Vercel has deployed the new build!`);
      console.log(`Total active bundles inspected: ${status.totalScripts}`);
      console.log(`mock-link found in bundles: NO (100% PURGED)`);
      console.log('\n================================================================');
      return true;
    } else {
      console.log(`[${now}] Attempt ${attempt}/20: Still serving bundle with mock-link (${status.mockLocation}). Waiting 10s...`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  console.error('\n❌ Timed out waiting for Vercel deployment.');
  return false;
}

pollUntilClean().then(success => {
  if (!success) process.exit(1);
});
