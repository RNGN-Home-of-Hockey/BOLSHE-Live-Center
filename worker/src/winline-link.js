// Links to Winline with the «Больше» promo code. The partner link opens only the Winline app;
// for a match we take the tracking marks the partner link redirects to and put them on the
// match's own Winline page (the same way the HOH app does).
//   GET /go/winline?m=<match_id>  → 302 to the match on winline.ru (or the partner link)

const PARTNER = 'https://p.winline.ru/s/wn37T7YfAd?statid=1837_&sub4=bolshe&promocode=BOLSHE';
const WINLINE_HOST = /(^|\.)winline\.ru$/i;

export async function winlineLink(env, matchId) {
  const row = matchId
    ? await env.DB.prepare('SELECT wl_url FROM match_odds WHERE match_id = ?').bind(String(matchId)).first()
    : null;
  let destination;
  try {
    destination = row?.wl_url ? new URL(row.wl_url) : null;
  } catch {
    destination = null;
  }
  if (!destination || !WINLINE_HOST.test(destination.hostname)) return PARTNER;
  try {
    const partner = await fetch(PARTNER, {
      redirect: 'manual',
      headers: { 'user-agent': 'BolsheLiveCenter/affiliate-router' },
      signal: AbortSignal.timeout(5000),
    });
    const location = partner.headers.get('location');
    const affiliate = location ? new URL(location) : null;
    if (!affiliate || !WINLINE_HOST.test(affiliate.hostname)) return PARTNER;
    for (const [k, v] of affiliate.searchParams) destination.searchParams.set(k, v);
    destination.searchParams.set('statid', '1837_');
    destination.searchParams.set('sub4', 'bolshe');
    destination.searchParams.set('promocode', 'BOLSHE');
    if (!destination.searchParams.get('utm_promo')) destination.searchParams.set('utm_promo', 'BOLSHE');
    return destination.toString();
  } catch {
    return PARTNER;
  }
}
