'use strict';

let isTopFrame = false;
try {
    window.top.origin;
    isTopFrame = window === window.top;
}
catch {
    isTopFrame = true;
}
const topOrigin = isTopFrame ? window.origin : window.top.origin;

const utils = {
    printVerbose: function () {
        console.log('[MyWebGuard]', ...arguments);
    },
    sleep: function (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    promisify: function (thisArg, fnName) {
        const fn = thisArg[fnName];
        return function () {
            return new Promise((resolve, reject) => {
                fn.call(thisArg, ...arguments, function () {
                    const lastError = chrome.runtime.lastError;
                    if (lastError instanceof Object) {
                        return reject(lastError.message);
                    }
                    resolve(...arguments);
                });
            });
        };
    },
    getDefaultRules: function () {
        let rules = {
            origins: {}
        };
        rules.origins[topOrigin] = false;
        return rules;
    },
    inIFrame: function () {
        try {
            window.top.origin;
            return false;
        }
        catch { // iframe 
            return true;
        }
    },
    getIFrameRules: function () {
        let rules = {
            origins: {}
        };
        rules.origins[window.origin] = true;
        return rules;
    },
};
const apis = {
    chromeStorage: {
        getItem: async function (key) {
            let bin;
            try {
                bin = await utils.promisify(chrome.storage.local, 'get')(key);
            } catch (ex) {
            }
            return bin instanceof Object ? bin[key] : null;
        },
        setItem: async function (key, value) {
            let bin = {};
            bin[key] = value;
            await utils.promisify(chrome.storage.local, 'set')(bin);
        },
        removeItem: async function (key) {
            await utils.promisify(chrome.storage.local, 'remove')(key);
        }
    }
};
const storages = {
    sessionStorage: {
        mutex: {
            MUTEX_KEY: 'MyWebGuard_Mutex',
            unlock: function () {
                window.sessionStorage.removeItem(this.MUTEX_KEY);
            }
        },
        DATA_KEY: 'MyWebGuard_Data',
        getCodeOriginList: function () {
            const json = window.sessionStorage.getItem(this.DATA_KEY);
            return json == null ? [topOrigin,] : JSON.parse(json);
        }
    },
    chromeLocal: {
        mutex: {
            MUTEX_KEY: 'mutex:' + topOrigin,
            MUTEX_VALUE: '1',
            lock: async function () {
                let mutex;
                while (true) {
                    mutex = await apis.chromeStorage.getItem(this.MUTEX_KEY);
                    if (mutex != this.MUTEX_VALUE)
                        break;
                    await utils.sleep(20);
                }
                await apis.chromeStorage.setItem(this.MUTEX_KEY, this.MUTEX_VALUE);
            },
            unlock: async function () {
                await apis.chromeStorage.removeItem(this.MUTEX_KEY);
            }
        },
        RULES_KEY: 'rules:' + topOrigin,
        getRules: async function () {
            const json = await apis.chromeStorage.getItem(this.RULES_KEY);
            return json == null ? utils.getDefaultRules() : JSON.parse(json);
        },
        addOriginRule: async function (origin, isBLocked) {
            await this.mutex.lock();
            let rules = await this.getRules();
            rules.origins[origin] = isBLocked;
            const json = JSON.stringify(rules);
            await apis.chromeStorage.setItem(this.RULES_KEY, json);
            await this.mutex.unlock();
        },
    },
};

(async () => {
    if (isTopFrame) {
        storages.sessionStorage.mutex.unlock();
        await storages.chromeLocal.mutex.unlock();
    }

    const rules = await storages.chromeLocal.getRules();
    // const rules = {
    //     origins: {
    //         'https://static.xx.fbcdn.net': true,
    //         'https://tiki.vn': false,
    //         'https://frontend.tikicdn.com': false,
    //         'https://trackity.tiki.vn': false
    //     }
    // };

    if (isTopFrame) {
        utils.printVerbose('Rules.origins:', rules.origins);
    }

    let json = JSON.stringify(rules);
    const injectScript = document.createElement('script');
    let rawCode = '(' + myWebGuard.toString() + ')();';
    injectScript.innerHTML = rawCode.replace('JSON_RULES', window.btoa(json));
    document.documentElement.insertBefore(injectScript, document.documentElement.childNodes[0]);
})();

if (isTopFrame) {
    (async () => {
        utils.printVerbose('Service is running in', location.href);
        while (true) {
            await utils.sleep(300);
            const codeOriginList = storages.sessionStorage.getCodeOriginList();
            const rules = await storages.chromeLocal.getRules();
            for (let i = 0; i < codeOriginList.length; i++) {
                const origin = codeOriginList[i];
                if (!(origin in rules.origins)) {
                    await storages.chromeLocal.addOriginRule(origin, true);
                }
            }
        }
    })();
}