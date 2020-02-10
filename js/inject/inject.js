'use strict';

function myWebGuard() {
    const monitor = {
        method: function (object, methodName, policy) {
            while (!Object.prototype.hasOwnProperty.call(object, methodName) && object.__proto__)
                object = object.__proto__;
            if (object === null) {
                throw new Error('Failed to find function for alias ' + methodName);
            }
            const method = object[methodName];
            if (method === null || method === undefined)
                throw new Error('No method ' + methodName + ' found for ' + object);

            method.apply = Function.prototype.apply;
            object[methodName] = function () {
                const obj = this;
                const args = arguments;
                const proceed = function () {
                    return method.apply(obj, args);
                };
                return policy(obj, args, proceed);
            };
        },
        property: function (prototype, propertyName, policies) {
            while (!Object.prototype.hasOwnProperty.call(prototype, propertyName) && prototype.__proto__)
                prototype = prototype.__proto__;
            if (prototype === null) {
                throw new Error('Failed to find function for alias ' + propertyName);
            }
            const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
            if (descriptor === null || descriptor === undefined)
                throw new Error('No descriptor ' + propertyName + ' found for ' + prototype);

            const wrapper = {
                get: function () {
                    const obj = this;
                    const args = arguments;
                    const proceed = function () {
                        return descriptor.get.call(obj);
                    };
                    if (!policies.hasOwnProperty('get'))
                        return proceed();
                    return policies.get(obj, args, proceed);

                },
                set: function () {
                    const obj = this;
                    const args = arguments;
                    const proceed = function () {
                        return descriptor.set.call(obj, args[0]);
                    };
                    if (!policies.hasOwnProperty('set'))
                        return proceed();
                    return policies.set(obj, args, proceed);
                }
            };
            for (let key in descriptor) {
                if (!wrapper.hasOwnProperty(key)) {
                    wrapper[key] = descriptor[key];
                }
            }
            Object.defineProperty(prototype, propertyName, wrapper);
        }
    };
    const utils = {
        printDebug: function () {
            console.log('[MyWebGuard]', ...arguments);
        },
        getCodeOrigin: function () {
            const urls = new Error().stack.match(/https?:\/\/[^:]+/g);
            return urls === null ? undefined : new URL(urls[urls.length - 1]);
        },
        isCrossOrigin: function (url) {
            try {
                const topOrigin = window.top.origin;
                const origin = new URL(url).origin;
                return topOrigin != origin;
            }
            catch {
                return false;
            }
        },
        isOriginBlocked: function (url) {
            try {
                const topOrigin = window.top.origin;
                const origin = new URL(url).origin;
                return topOrigin != origin;
            }
            catch {
                return false;
            }
        }
    };

    // let json = window.atob('JSON_RULES');
    // let rules = JSON.parse(json);

    monitor.property(HTMLImageElement.prototype, 'src', {
        set: function (obj, args, proceed) {
            const val = args[0];
            if (!utils.isCrossOrigin(val))
                return proceed();

            const codeOrigin = utils.getCodeOrigin().origin;
            if (!utils.isOriginBlocked(codeOrigin))
                return proceed();

            // utils.printDebug('[HTMLImageElement.prototype.src]', 'Blocked code execution from', codeOrigin);
        }
    });
    monitor.property(HTMLScriptElement.prototype, 'src', {
        set: function (obj, args, proceed) {
            const val = args[0];
            if (!utils.isCrossOrigin(val))
                return proceed();

            const codeOrigin = utils.getCodeOrigin().origin;
            if (!utils.isOriginBlocked(codeOrigin))
                return proceed();

            // utils.printDebug('[HTMLScriptElement.prototype.src]', 'Blocked code execution from', codeOrigin);
        }
    });
    monitor.method(Element.prototype, 'setAttribute', function (obj, args, proceed) {
        let block = false;
        try {
            const key = args[0].toString();
            const val = args[1].toString();
            if (key.toLowerCase() === 'src' && utils.isCrossOrigin(val)) {
                const codeOrigin = utils.getCodeOrigin().origin;
                if (utils.isOriginBlocked(codeOrigin)) {
                    block = true;
                }
            }
        }
        catch { }

        if (!block)
            return proceed();

        // utils.printDebug('[Element.prototype.setAttribute]', 'Blocked code execution from', codeOrigin);
    });
    monitor.method(document, "createElement", function (obj, args, proceed) {
        const codeOrigin = utils.getCodeOrigin().origin;
        if (!utils.isOriginBlocked(codeOrigin)) {
            return proceed();
        }

        // utils.printDebug('[document.createElement]', 'Blocked code execution from', codeOrigin);
    });
}

(async () => {
    Error.stackTraceLimit = Infinity;
    // console.log('INJECTED:', location.href);

    let json = JSON.stringify({});

    const injectScript = document.createElement('script');
    injectScript.innerHTML = 'Error.stackTraceLimit = Infinity;' +
        '(' + myWebGuard.toString() + ')();';
    let rawCode = '(' + myWebGuard.toString() + ')();';
    rawCode = rawCode.replace('JSON_RULES', window.btoa(json));
    injectScript.innerHTML = rawCode;
    document.documentElement.insertBefore(injectScript, document.documentElement.childNodes[0]);
})();