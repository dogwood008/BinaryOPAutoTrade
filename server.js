'use strict';

// ref: https://qiita.com/ritukiii/items/8173ff98f31c2f76b39a

const DEBUG = true;

const http = require('http');
const config = require('./config');
const server = http.createServer();
const querystring = require("querystring");
const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');
const Browser = require('./browser');


const userId = process.env.USER_ID;
const password = process.env.PASSWORD;
const browser = new Browser(userId, password);

const response = (res, data) => {
  res.writeHead(200, {'Content-Type' : 'application/json'});
  res.write(JSON.stringify(data));
  res.end();
};

const routing = async (path, res, params) => {
  switch (path) {
    case '/init':
      const useDisplay = !!process.env.DISPLAY_AVAILABLE;
      const chromiumPath =
        process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
      await browser.launch(
        {
          executablePath: chromiumPath,
          headless: !useDisplay
        }
      );
      await browser.login(userId, password);

      await browser.selectCurrencyPair('usdjpy')
      await browser.stopTutorial();

      console.debug(await browser.endTime());

      const targets = await browser.targetRatesPrices();
      console.debug(targets);
      response(res, targets);
      break;

    case '/price':
      const price = await browser.targetRatesPrices();
      console.debug(price);
      response(res, price);
      break;

    case '/buy':
      console.debug([params.get('rate'), params.get('high_low'), params.get('lots')]);
      const rate = params.get('rate');
      const highLow = params.get('high_low') || 'high';
      const lots = parseInt(params.get('lots'));
      //const nthChild = prices.rates.indexOf(rate);
      const result = await browser.buyAnOption(rate, highLow, lots);
      console.debug(result);

      console.debug('finished');
      response(res, Object.assign({status: 'succeeded'}, result));
      break;
    case '/finish':
      await browser.close();
      res.end();
      break;
    default:
      response(res, {status: 'failed', message: `Invalid path given: ${path}`});
  }
};

server.on('request', (req, res) => {
  (async (url) => {
    try {
      let k, v;
      const urlobj = new URL(`http://example.com${req.url}`); // TODO: ugly
      const params = urlobj.searchParams;
      console.debug(params.toString());
      const path = urlobj.pathname;
      await routing(path, res, params);
    } catch (e) {
      console.error(e);
      console.error('---------');
      const stack = { name: e.name, message: e.message,
          string: e.toString()};
      // TODO: Use log4js
      //   https://github.com/log4js-node/log4js-node
      try {
        if (DEBUG) { stack.trace = e.stack.split('\n') }
      } catch {}
      response(res, stack);
    }
  })(req.url);
});

// サーバを待ち受け状態にする
// 第1引数: ポート番号
// 第2引数: IPアドレス
server.listen(config.port);

console.log('ポート番号: ' + config.port);
