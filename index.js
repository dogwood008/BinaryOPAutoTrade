const fs = require('fs');
const StateMachine = require('javascript-state-machine');
const puppeteer = require('puppeteer');

const COOKIES_PATH = './cookies.json';
const USER_ID = process.env.USER_ID;
const PASSWORD = process.env.PASSWORD;
const FAIL_SAFE_MAX_LOTS = parseInt(process.env.FAIL_SAFE_MAX_LOTS) || 10;
const TRADE_MAIN_URL = 'https://opt.yjfx.jp/boctradeweb/';

///////// utils ////////
const seconds = (s) => 1000 * s;
// zip: https://qiita.com/QUANON/items/c1cf22fda7c7813cc962
const zip = (array1, array2) => array1.map((_, i) => [array1[i], array2[i]]);
const pageState = new StateMachine({
  init: 'blank',
  transitions: [
    { name: 'login', from: 'blank', to: 'login' },
    { name: 'trade', from: 'login', to: 'trade' },
    { name: 'finish', from: 'trade' }
  ]
});
///////// /utils ////////

const skipTutorial = async (page) => {
  console.debug('skipTutorial');
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  for (let cookie of cookies) {
    await page.setCookie(cookie);
  }
}

const login = async (page) => {
  pageState.login();
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
  pageState.trade();
}

const selectCurrencyPair = async (pair, page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  console.debug('selectCurrency');
  const tabSelecter = '#content_scroll_wrapper_0 > div > div > '
    + 'div.panel.panel_0_0_1.horizontalTradeProduct > div.tradeProduct_2 > div > '
    + `div.symbol_box.changeable_on_click_style.${pair} > span.symbol_image`;
  await page.waitForSelector(tabSelecter, {timeout: seconds(10), visible: true});
  console.debug('selectCurrency: rendering was finished, wait for 1 secs');
  await page.waitFor(seconds(1));
  console.debug('click started');
  await page.click(tabSelecter);
  console.debug('click finished');
}

const endTime = async (page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  const buttonSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_1.horizontalTradeProduct > div.tradeProduct_0 > div.scrollpane > div div.selected';
  await page.waitForSelector(buttonSelector, {timeout: seconds(5), visible: true});
  const text = await page.$eval(buttonSelector, e => e.textContent);
  const extractRegex = /第(\d+)回 (受付中|受付前|判定済){1}(\d{2}):(\d{2})～(\d{2}):(\d{2})/;
  const matchedArray = text.match(extractRegex);
  return matchedArray.slice(-2);
}

const targetRates = async (page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  const ratesSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_2.ladder > table > tbody > tr > td.target_price > div';
  const prices = await page.$$eval(ratesSelector, list => {
    return list.map(e => e.textContent.trim());
  });
  return prices;
}

const targetPrices = async (page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  const lowPricesSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_2.ladder > table > tbody > tr > td.ticket_size.low > div.new_order.changeable_on_click_style > div.amount_wrapper > span.amount';
  const highPricesSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_2.ladder > table > tbody > tr > td.ticket_size.high > div.new_order.changeable_on_click_style > div.amount_wrapper > span.amount';
  await page.waitForSelector([lowPricesSelector, highPricesSelector],
    {timeout: seconds(5), visible: true});
  await page.waitFor(seconds(3));
  const lowPrices = await page.$$eval(lowPricesSelector, list => {
    return list.map(e => e.textContent);
  });
  const highPrices = await page.$$eval(highPricesSelector, list => {
    return list.map(e => e.textContent);
  });
  console.debug([lowPrices, highPrices]);
  return zip(lowPrices, highPrices);
}

const targetRatesPrices = async (page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  const rates = await targetRates(page);
  const prices = await targetPrices(page);
  const targets = zip(rates, prices);
  return targets;
}

const _setUnitRate = async (rate, highOrLow, page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  console.debug(await targetRates(page));
  const nthChild = (await targetRates(page)).indexOf(rate);
  if (nthChild === -1) { throw new Error(`Invalid rate: ${rate}`) };
  const buttonSelector = `#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_2.ladder > table > tbody > tr:nth-child(${nthChild}) > td.ticket_size.${highOrLow}.active > div.new_order.changeable_on_click_style > div.amount_wrapper`;
  await page.waitForSelector(buttonSelector, {timeout: seconds(3), visible: true});
  await page.click(buttonSelector);
}

const _setLots = async (lots, page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  const addButtonSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_3 > ul > li.li_body.input_lot > button.button.plus_button.changeable_on_click_style';
  const lotsSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_3 > ul > li.li_body.input_lot > span';
  for (let i = 0; i < FAIL_SAFE_MAX_LOTS; i++) {
    await page.waitForSelector(addButtonSelector, {timeout: seconds(3), visible: true});
    await page.click(addButtonSelector);
    await page.waitForSelector(lotsSelector, {timeout: seconds(3), visible: true});
    const currentLots = parseInt(await page.$eval(lotsSelector, e => e.textContent));
    if (currentLots >= lots) { break; }
  }
}

const _checkSkipConfirmation = async (page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  const checkboxSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_3 > ul > li.li_body.suppress_confirm > label > input';
  await page.waitForSelector(checkboxSelector, {timeout: seconds(3), visible: true});
  // https://checklyhq.com/docs/browser-checks/scraping-onpage-elements/
  const isChecked = await page.$eval(checkboxSelector, input => input.checked);
  if (!isChecked) {
    await page.click(checkboxSelector);
  }
}

const _clickBuyButton = async (page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  const buttonSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_3 > ul > li.li_body.order_button > button';
  await page.waitForSelector(buttonSelector, {timeout: seconds(3), visible: true});
  await page.click(buttonSelector);
}

// returns: null => succeeded, str => error
const buyAnOption = async (rate, highOrLow, lots, page) => {
  if (!(pageState.is('trade'))) { throw new Error('Invalid State'); }
  await _setUnitRate(rate, highOrLow, page);
  await _setLots(lots, page);
  await _checkSkipConfirmation(page);
  await _clickBuyButton(page);
  const errorDialogSelector = 'body > div.ui-dialog.ui-widget.ui-widget-content.ui-corner-all.response_status_error';
  await page.waitFor(seconds(3));
  // https://github.com/GoogleChrome/puppeteer/issues/1149#issuecomment-339020744
  const isError = await page.$(errorDialogSelector) !== null;
  if (isError) {
    const messageSelector = 'body > div.ui-dialog.ui-widget.ui-widget-content.ui-corner-all.response_status_error > div.dialog_box.ui-dialog-content.ui-widget-content';
    const message = await page.$eval(messageSelector, e => e.textContent);
    return message;
  }
  return null;
}

const main = async () => {
  const browser = await puppeteer.launch({headless: false, args: ['--window-size=1600,950']});
  const page = await browser.newPage();
  await skipTutorial(page);
  await login(page);

  await selectCurrencyPair('usdjpy', page)

  console.debug(await endTime(page));

  const targets = await targetRatesPrices(page);
  console.debug(targets);

  const result = await buyAnOption('107.457', 'high', 3, page);
  console.debug(result);

  console.debug('finished');
  //await page.screenshot({path: 'example.png'});
  //await browser.close();
};

(async () => {
  try {
  await main()
  } catch (e) {
    console.error(e);
  }
})();
