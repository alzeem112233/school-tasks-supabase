const html = await fetch(`/?legacy=${Date.now()}`, { cache: "no-store" }).then((response) => response.text());
const match = html.match(/src="(\/assets\/(?:app|index-[^"]+)\.js)"/);
if (!match) {
  location.reload();
} else if (match[1] === location.pathname) {
  location.reload();
} else {
  await import(`${match[1]}?legacy=${Date.now()}`);
}
