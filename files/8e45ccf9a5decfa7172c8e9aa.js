import axios from 'axios';
import * as cheerio from 'cheerio';

const UA       = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const BASE_URL = 'https://spotidown.app';

async function getSession() {
  const { data, headers } = await axios.get(`${BASE_URL}/es5`, {
    headers: { 'User-Agent': UA }, timeout: 12000
  });
  const $         = cheerio.load(data);
  const tokenName = $('input[type="hidden"]').not('[name="g-recaptcha-response"]').first().attr('name');
  const token     = $('input[type="hidden"]').not('[name="g-recaptcha-response"]').first().val();
  const cookies   = headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';
  return { tokenName, token, cookies };
}

function buildHeaders(cookies) {
  return {
    'User-Agent':       UA,
    'Content-Type':     'application/x-www-form-urlencoded',
    'Referer':          `${BASE_URL}/es5`,
    'Origin':           BASE_URL,
    'Cookie':           cookies,
    'X-Requested-With': 'XMLHttpRequest',
  };
}

export async function spotidownTrack(url) {
  if (!url.includes('spotify.com/track'))
    throw new Error('URL inválida. Debe ser un link de track de Spotify.');

  const { tokenName, token, cookies } = await getSession();

  const { data: actionData } = await axios.post(
    `${BASE_URL}/action`,
    new URLSearchParams({ url, 'g-recaptcha-response': '', [tokenName]: token }),
    { headers: buildHeaders(cookies), timeout: 20000 }
  );

  if (actionData?.error) throw new Error(actionData.message || 'Error al obtener el track.');

  const $r       = cheerio.load(actionData.data || '');
  const dataF    = $r('input[name="data"]').first().val();
  const baseF    = $r('input[name="base"]').first().val();
  const tkF      = $r('input[name="token"]').first().val();

  if (!dataF) throw new Error('No se pudo obtener la info del track.');

  const trackInfo = JSON.parse(Buffer.from(dataF, 'base64').toString());

  const { data: trackData } = await axios.post(
    `${BASE_URL}/action/track`,
    new URLSearchParams({ data: dataF, base: baseF, token: tkF }),
    { headers: buildHeaders(cookies), timeout: 30000 }
  );

  if (trackData?.error) throw new Error(trackData.message || 'Error al descargar el track.');

  const $t    = cheerio.load(trackData.data || '');
  const links = [];

  $t('a[id="popup"]').each((_, el) => {
    const href  = $t(el).attr('href') || '';
    const label = $t(el).find('span span').text().trim();
    if (href) links.push({ label, url: href });
  });

  const mp3   = links.find(l => l.label.toLowerCase().includes('mp3'))?.url || null;
  const cover = links.find(l => l.label.toLowerCase().includes('cover'))?.url || null;

  return {
    name:     trackInfo.name,
    artist:   trackInfo.artist,
    album:    trackInfo.album,
    duration: trackInfo.duration,
    year:     trackInfo.date,
    cover:    trackInfo.cover,
    mp3,
    coverHd:  cover,
  };
}