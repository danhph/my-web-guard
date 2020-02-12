'use strict'

const utils = {
  printVerbose: function () {
    console.log('[MyWebGuard]', ...arguments)
  },
  sleep: function (ms) {
    const start = new Date()
    let current = null
    do {
      current = new Date()
    }
    while (current - start < ms)
  },
  sleepAsync: function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  },
  promisify: function (thisArg, fnName) {
    const fn = thisArg[fnName]
    return function () {
      return new Promise((resolve, reject) => {
        fn.call(thisArg, ...arguments, function () {
          const lastError = chrome.runtime.lastError
          if (lastError instanceof Object) {
            return reject(lastError.message)
          }
          resolve(...arguments)
        })
      })
    }
  },
}

const apis = {
  chromeTabs: {
    getSelected: async function () {
      const tabs = await utils.promisify(chrome.tabs, 'query')({
        'active': true,
        'lastFocusedWindow': true,
      })
      if (tabs.length == 0)
        return undefined
      return new URL(tabs[0].url).origin
    },
  },
}

$(document).ready(async function () {
  const dataSet = [
    ['getbootstrap.com', false],
    ['code.jquery.com', true],
    ['cdn.jsdelivr.net', true],
  ]

  $('#example').DataTable({
    data: dataSet,
    scrollY: '448px',
    scrollCollapse: true,
    info: false,
    paging: false,
    searching: false,
    columnDefs: [{ className: 'text-center', targets: 1 }],
  })

  const topOrigin = await apis.chromeTabs.getSelected()
  utils.printVerbose(topOrigin)
})