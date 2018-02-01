'use strict';

console.log('Options page');
var OAUTH_TOKEN;

chrome.runtime.onInstalled.addListener(function (details) {
  console.log('previousVersion', details.previousVersion);
  console.log('onInstalled: ' + details.reason);

  // On first install
  if (details.reason == 'install')
  {
    // Open up options page -- update since Chrome 40
    // chrome.runtime.openOptionsPage();
    // chrome.tabs.create({url: 'options.html'});

    // Inject script into all open tabs
    chrome.tabs.query({}, function(tabs)
    {
      console.log('Executing on tabs: ', tabs);
      for (var i = 0, l = tabs.length; i < l; ++i) {
        injectScript(tabs[i]);
      }
    });
  }
});

chrome.tabs.onUpdated.addListener(function (tabId) {
  chrome.pageAction.show(tabId);
});


// Listen for messages from the client side
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse)
{
  console.log(request);
  console.log(sender);

  switch (request.request)
  {
    case 'getClipboardData':
      sendResponse({ paste:pasteFromClipboard() });
      break;

    // Set browser action badge text (up to 4 chars)
    case 'setBadgeText':
      chrome.browserAction.setBadgeText({text: request.text});
      break;

    default:
      console.log('Unknown request received:', request);
      break;
  }
});

chrome.identity.getAuthToken({
    interactive: false
}, function(token) {
    if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError.message);
        return;
    }
    OAUTH_TOKEN = token;
});


// Omnibox default first suggestion (instructions)
chrome.omnibox.setDefaultSuggestion({
  description: '<dim>Add a task:</dim> <match>%s</match>'
});

// On activation in omnibox
chrome.omnibox.onInputStarted.addListener(function ()
{
  console.log('Omnibox onInputStarted()');

  // Get data
  chrome.storage.sync.get(null, function(data)
  {
    console.log('caching shortcuts...');

    if (chrome.runtime.lastError) {	// Check for errors
      console.log(chrome.runtime.lastError);
    } else {
    }
  });
});

// On omnibox input changed (user typing)
chrome.omnibox.onInputChanged.addListener(function (text, suggest)
{
  console.log('Omnibox onInputChanged:', text);

  // // Use text to check shortcuts for expansions
  // var expansion = shortcutCache[SHORTCUT_PREFIX + text];
  //
  // // If exists, surface expansion as suggestion
  // if (expansion && expansion.length)
  // {
  //   var suggestions = [];
  //
  //   // Process expansion
  //   var description = '<match>' + text + '</match>'
  //     + '<dim> &#8594; ' + expansion.split('\"').join('&quot;')
  //       .split('\'').join('&apos;')
  //       .split('<').join('&lt;')
  //       .split('>').join('&gt;')
  //       .split('&').join('&amp;')
  //     + '</dim>';
  //   suggestions.push({
  //     content: expansion,
  //     description: description,
  //   });
  //
  //   // Send suggestions to callback
  //   suggest(suggestions);
  // }
});

// On omnibox suggestion accepted
chrome.omnibox.onInputEntered.addListener(function (text, disposition)
{
  console.log('Omnibox onInputEntered:', text, disposition);

  // // If the entered text is a shortcut, expand it and jump
  // var expansion = shortcutCache[SHORTCUT_PREFIX + text];
  //
  // // If exists, update text with expansion instead
  // if (expansion && expansion.length) {
  //   text = expansion;
  // }
  //
  // // Check text for URL format prefix, otherwise add it
  // if (text.indexOf('http') != 0) {
  //   text = 'http://' + text;
  // }
  // console.log('url:', text);
  //
  // // Update / open tab according to disposition
  // switch (disposition)
  // {
  //   default:    // Default to updating current tab
  //   case 'currentTab':
  //     chrome.tabs.update({url: text});
  //     break;
  //
  //   case 'newForegroundTab':
  //     chrome.tabs.create({url: text});
  //     break;
  //
  //   case 'newBackgroundTab':
  //     chrome.tabs.create({url: text, active: false});
  //     break;
  // }
});


// Execute our content script into the given tab
function injectScript(tab)
{
  // Insanity check
  if (!tab || !tab.id) {
    console.log('Injecting into invalid tab:', tab);
    return;
  }

  // Loop through content scripts and execute in order
  var contentScripts = MANIFEST.content_scripts[0].js;
  for (var i = 0, l = contentScripts.length; i < l; ++i) {
    chrome.tabs.executeScript(tab.id, {
      file: contentScripts[i]
    });
  }
}

// Get paste contents from clipboard
function pasteFromClipboard()
{
  // Create element to paste content into
  document.querySelector('body').innerHTML += '<textarea id="clipboard"></textarea>';
  var clipboard = document.getElementById('clipboard');
  clipboard.select();

  // Execute paste
  var result;
  if (document.execCommand('paste', true)) {
    result = clipboard.value;
  }

  // Cleanup and return value
  clipboard.parentNode.removeChild(clipboard);
  return result;
}
