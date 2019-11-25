const fs = require('fs');
const StateMachine = require('javascript-state-machine');
const puppeteer = require('puppeteer');

// https://qiita.com/elzup/items/42867f13a6f1c457dc6d
const pp = v => console.dir(v, { depth: null, colors: true});

const COOKIES_PATH = './cookies.json';
const FAIL_SAFE_MAX_LOTS = parseInt(process.env.FAIL_SAFE_MAX_LOTS) || 10;
const HOME_URL = 'https://opt.yjfx.jp/';  // to set LocalStorage
const TRADE_MAIN_URL = 'https://opt.yjfx.jp/boctradeweb/';

class Browser {
  ///////// utils ////////
  seconds(s) {
    return 1000 * s;
  }
  // zip: https://qiita.com/QUANON/items/c1cf22fda7c7813cc962
  zip(array1, array2) {
    return array1.map((_, i) => [array1[i], array2[i]]);
  }
  ///////// /utils ////////

  constructor() {
    this.PAGE_STATE = new StateMachine({
      init: 'blank',
      transitions: [
        { name: 'login', from: 'blank', to: 'login' },
        { name: 'trade', from: 'login', to: 'trade' },
        { name: 'finish', from: 'trade' }
      ]
    });
  }

  async skipTutorial() {
    // TODO: チュートリアルをスキップできないので、
    // ダイアログを閉じられないか再試行
    // https://stackoverflow.com/questions/51789038/set-localstorage-items-before-page-loads-in-puppeteer
    console.debug('skipTutorial');
    const page = await this.browser.newPage();
    /*
    await page.setRequestInterception(true);
    await page.on('request', r => {
      r.respond({
        status: 200,
        contentType: 'text/plain',
        body: 'tweak me.',
      });
    });
    */
    await page.goto(TRADE_MAIN_URL, {waitUntil: 'domcontentloaded'});
    //await page.goto(HOME_URL, {waitUntil: 'domcontentloaded'});
    const test = await page.evaluate(async () => {
      const key = 'after_first_tutorial';
      const value = '{value: "true", expires: "Thu, 30 Jan 2037 05:15:27 GMT"}';
      await localStorage.setItem(key, value);
      console.log('------------');
      return localStorage.getItem(key);
    });
    debugger;
    console.log(test);
    console.log('aaaaaaaaaaaaaa')
    /*
    const p = await this.browser.newPage()
    await page.goto(TRADE_MAIN_URL, {waitUntil: 'domcontentloaded'});
    await p.evaluate(() => {
      const key = 'after_first_tutorial';
      const value = '{value: "true", expires: "Thu, 30 Jan 2037 05:15:27 GMT"}';
      console.log('----------------------------');
      console.log(localStorage.getItem('after_first_tutorial'));
      console.log('----------------------------');
    });
    await p.close();
    */
    await page.close();
  }

  async login(userId, password) {
    if (typeof userId === 'undefined' || userId === null) {
      throw new Error(`Invalid userId given: ${userId}`);
    }
    if (typeof password === 'undefined' || password === null) {
      throw new Error(`Invalid password given: ${password}`);
    }
    this.PAGE_STATE.login();
    console.debug('login');
    // console.debug('skipTutorial start');
    // await this.skipTutorial();
    // console.debug('skipTutorial end');
    this.page = await this.browser.newPage();
    debugger;
    await this.page.goto(TRADE_MAIN_URL, {waitUntil: 'domcontentloaded'});
    const idInputTextSelecter = '#loginForm input[name=loginId]';
    const pwInputTextSelecter = '#loginForm input[name=password]';
    const loginBtnSelecter = '#loginForm input[class=button]';
    await this.page.waitForSelector(idInputTextSelecter);
    await this.page.waitForSelector(pwInputTextSelecter);
    await this.page.type(idInputTextSelecter, userId);
    await this.page.type(pwInputTextSelecter, password);
    this.page.click(loginBtnSelecter);
    this.PAGE_STATE.trade();
  }

  async stopTutorial() {
    await this.page.evaluate(() => stopTutorial());
  }

  async selectCurrencyPair(pair, page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    console.debug('selectCurrency');
    const tabSelecter = '#content_scroll_wrapper_0 > div > div > '
      + 'div.panel.panel_0_0_1.horizontalTradeProduct > div.tradeProduct_2 > div > '
      + `div.symbol_box.changeable_on_click_style.${pair} > span.symbol_image`;
    await this.page.waitForSelector(tabSelecter, {timeout: this.seconds(10), visible: true});
    console.debug('selectCurrency: rendering was finished, wait for 1 secs');
    await this.page.waitFor(this.seconds(1));
    console.debug('click started');
    await this.page.click(tabSelecter);
    console.debug('click finished');
  }

  async endTime(page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    const buttonSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_1.horizontalTradeProduct > div.tradeProduct_0 > div.scrollpane > div div.selected';
    await this.page.waitForSelector(buttonSelector, {timeout: this.seconds(5), visible: true});
    const text = await this.page.$eval(buttonSelector, e => e.textContent);
    const extractRegex = /第(\d+)回 (受付中|受付前|判定済){1}(\d{2}):(\d{2})～(\d{2}):(\d{2})/;
    const matchedArray = text.match(extractRegex);
    return matchedArray.slice(-2);
  }

  async targetRates(page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    const ratesSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_2.ladder > table > tbody > tr > td.target_price > div';
    const prices = await this.page.$$eval(ratesSelector, list => {
      return list.map(e => e.textContent.trim());
    });
    return prices;
  }

  async targetPrices(page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    const lowPricesSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_2.ladder > table > tbody > tr > td.ticket_size.low > div.new_order.changeable_on_click_style > div.amount_wrapper > span.amount';
    const highPricesSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_2.ladder > table > tbody > tr > td.ticket_size.high > div.new_order.changeable_on_click_style > div.amount_wrapper > span.amount';
    await this.page.waitForSelector([lowPricesSelector, highPricesSelector],
      {timeout: this.seconds(5), visible: true});
    await this.page.waitFor(this.seconds(3));
    const lowPrices = await this.page.$$eval(lowPricesSelector, list => {
      return list.map(e => e.textContent);
    });
    const highPrices = await this.page.$$eval(highPricesSelector, list => {
      return list.map(e => e.textContent);
    });
    console.debug([lowPrices, highPrices]);
    return this.zip(lowPrices, highPrices);
  }

  /*
   * 現在のオプション売買価を得る。
   */
  async targetRatesPrices(page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    const rates = await this.targetRates(this.page);
    const prices = await this.targetPrices(this.page)
    const pairs = ((rates, pricesArr) => {
      return this.zip(rates, pricesArr).map((r) => {
        const pair = { low: parseInt(r[1][0]), high: parseInt(r[1][1]) };
        console.log(r); return { [r[0]]: pair }
      });
    })(rates, prices);
    const targets = {
      rates: rates,
      prices: pairs
    };
    return targets;
  }

  async _setUnitRate(rate, highOrLow, page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    console.debug(await this.targetRates(this.page));
    const nthChild = (await this.targetRates(this.page)).indexOf(rate) + 1;
    if (nthChild <= 0) { throw new Error(`Invalid rate: ${rate}`) };
    const buttonSelector = `#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_2.ladder > table > tbody > tr:nth-child(${nthChild}) > td.ticket_size.${highOrLow} > div.new_order.changeable_on_click_style > div.amount_wrapper`;
    await this.page.waitForSelector(buttonSelector, {timeout: this.seconds(3), visible: true});
    await this.page.click(buttonSelector);
  }

  async _setLots (lots, page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    const addButtonSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_3 > ul > li.li_body.input_lot > button.button.plus_button.changeable_on_click_style';
    const lotsSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_3 > ul > li.li_body.input_lot > span';
    for (let i = 0; i < FAIL_SAFE_MAX_LOTS; i++) {
      await this.page.waitForSelector(addButtonSelector, {timeout: this.seconds(3), visible: true});
      await this.page.click(addButtonSelector);
      await this.page.waitForSelector(lotsSelector, {timeout: this.seconds(3), visible: true});
      const currentLots = parseInt(await this.page.$eval(lotsSelector, e => e.textContent));
      if (currentLots >= lots) { break; }
    }
  }

  async _checkSkipConfirmation (page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    const checkboxSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_3 > ul > li.li_body.suppress_confirm > label > input';
    await this.page.waitForSelector(checkboxSelector, {timeout: this.seconds(3), visible: true});
    // https://checklyhq.com/docs/browser-checks/scraping-onpage-elements/
    const isChecked = await this.page.$eval(checkboxSelector, input => input.checked);
    if (!isChecked) {
      await this.page.click(checkboxSelector);
    }
  }

  async _clickBuyButton(page) {
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    const buttonSelector = '#content_scroll_wrapper_0 > div > div > div.panel.panel_0_0_2.ladderOrder > div.ladder_order_3 > ul > li.li_body.order_button > button';
    await this.page.waitForSelector(buttonSelector, {timeout: this.seconds(3), visible: true});
    await this.page.click(buttonSelector);
  }

  // returns: null => succeeded, str => error
  async buyAnOption(rate, highOrLow, lots, page){
    if (!(this.PAGE_STATE.is('trade'))) { throw new Error('Invalid State'); }
    await this._setUnitRate(rate, highOrLow, this.page);
    await this._setLots(lots, this.page);
    await this._checkSkipConfirmation(this.page);
    await this._clickBuyButton(this.page);
    const errorDialogSelector = 'body > div.ui-dialog.ui-widget.ui-widget-content.ui-corner-all.response_status_error';
    await this.page.waitFor(this.seconds(3));
    // https://github.com/GoogleChrome/puppeteer/issues/1149#issuecomment-339020744
    const isError = await this.page.$(errorDialogSelector) !== null;
    if (isError) {
      const messageSelector = 'body > div.ui-dialog.ui-widget.ui-widget-content.ui-corner-all.response_status_error > div.dialog_box.ui-dialog-content.ui-widget-content';
      const message = await this.page.$eval(messageSelector, e => e.textContent);
      const okBtnSelector = 'body > div.ui-dialog.ui-widget.ui-widget-content.ui-corner-all.response_status_error.ui-draggable.ui-resizable > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button';
      await this.page.waitForSelector(okBtnSelector, {timeout: this.seconds(3), visible: true});
      await this.page.click(okBtnSelector);
      return { status: 'failed', message: message };
    }
    return { rate: rate, highOrLow: highOrLow, lots: lots };
  }

  async launch(options={}) {
    const params = Object.assign(
      options, { args: ['--window-size=1600,950'] });
    this.browser = await puppeteer.launch(params);
    this.page = await this.browser.newPage();
  }

  async screenshot(filePath) {
    await this.page.screenshot({path: filePath});
  }

  async close() {
    await this.browser.close();
  }
}


const main = async () => {
  const userId = process.env.USER_ID;
  const password = process.env.PASSWORD;
  const b = new Browser(userId, password);

  await b.launch({headless: false});
  await b.login(userId, password);

  await b.selectCurrencyPair('usdjpy')

  console.debug(await b.endTime());

  const targets = await b.targetRatesPrices();
  pp(targets);

  const result = await b.buyAnOption('109.039', 'high', 3);
  console.debug(result);

  console.debug('finished');
  await b.close();
};

module.exports = Browser;

if(require.main === module) {
  (async () => {
    try {
      await main()
    } catch (e) {
      console.error(e);
    }
  })();
}
