const fs = require('fs');

const COOKIES_PATH = './cookies.json';
const USER_ID = process.env.USER_ID;
const PASSWORD = process.env.PASSWORD;
const TRADE_MAIN_URL = 'https://opt.yjfx.jp/boctradeweb/';

const puppeteer = require('puppeteer');

const skipTutorial = async (page) => {
  console.debug('skipTutorial');
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  for (let cookie of cookies) {
    await page.setCookie(cookie);
  }
}

const login = async (page) => {
  console.debug('login');
  await page.goto(TRADE_MAIN_URL, {waitUntil: 'domcontentloaded'});
  const idInputTextSelecter = '#loginForm input[name=loginId]';
  const pwInputTextSelecter = '#loginForm input[name=password]';
  const loginBtnSelecter = '#loginForm input[class=button]';
  await page.waitForSelector(idInputTextSelecter);
  await page.waitForSelector(pwInputTextSelecter);
  await page.type(idInputTextSelecter, USER_ID);
  await page.type(pwInputTextSelecter, PASSWORD);
  page.click(loginBtnSelecter);
}

const selectCurrency = async (pair, page) => {
  console.debug('selectCurrency');
  const tabSelecter = (pair) => '#content_scroll_wrapper_0 > div > div > '
    + 'div.panel.panel_0_0_1.horizontalTradeProduct > div.tradeProduct_2 > div > '
    + `div.symbol_box.changeable_on_click_style.${pair} > span.symbol_image`;
  await page.waitForSelector(tabSelecter(pair), {timeout: 1000 * 5, visible: true});
  console.debug('selectCurrency: rendering was finished, wait for 3 secs');
  await page.waitFor(1000 * 3);
  console.debug('click started');
  await page.click(tabSelecter(pair));
  console.debug('click finished');
}

(async () => {
  const browser = await puppeteer.launch({headless: false});
  //const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await skipTutorial(page);
  await login(page);

  await selectCurrency('usdjpy', page)
  console.debug('finished');
  await page.screenshot({path: 'example.png'});
  //await browser.close();
})();
