'use strict';

var OAUTH_TOKEN;

chrome.runtime.onInstalled.addListener(function (details) {
  console.log('previousVersion', details.previousVersion);
});

chrome.tabs.onUpdated.addListener(function (tabId) {
  chrome.pageAction.show(tabId);
});

console.log('\'Allo \'Allo! Event Page for Page Action');

chrome.identity.getAuthToken({
    interactive: false
}, function(token) {
    if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError.message);
        return;
    }
    OAUTH_TOKEN = token;
});
