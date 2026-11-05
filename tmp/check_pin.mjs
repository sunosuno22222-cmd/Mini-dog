async function main() {
  const pinUrl = "https://www.pinterest.com/pin/39406565484271571/";
  const res = await fetch(pinUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
    }
  });
  console.log("Status:", res.status, "URL:", res.url);
  const html = await res.text();
  
  const matches = [...html.matchAll(/https:\/\/i\.pinimg\.com\/[^\s"'>]+/g)].map(m => m[0]);
  const unique = [...new Set(matches)];
  console.log("Pinimg URLs count:", unique.length);
  for (const u of unique) {
    console.log(u);
  }
}

main().catch(console.error);
