'use strict';

console.log('Options page');
var NUM_RECENT = 50;
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

    case 'getPageTitle':
      getPageTitle(request.url, sendResponse);
      // sendResponse({ title:getPageTitle(request.url) });
      break;

    case 'getRecentBookmarks':
      getRecentBookmarks(sendResponse);
      break;

      case 'getRecentHistory':
      getRecentHistory(request.query, sendResponse);
      break;

    // Set browser action badge text (up to 4 chars)
    case 'setBadgeText':
      chrome.browserAction.setBadgeText({text: request.text});
      break;

    default:
      console.log('Unknown request received:', request);
      break;
  }

  return true;
});

// Get recent bookmarks
function getRecentBookmarks(callback) {
  console.log('getRecentBookmarks');
  chrome.bookmarks.getRecent(NUM_RECENT, function(results) {
    if (results) {
      console.log(results);
      if (callback) {
        callback(results);
      }
    }
  });
}

// Get recent page visits
function getRecentHistory(search, callback) {
  console.log('getRecentHistory');
  var query = {
    text: (search ? search : ''),
    maxResults: NUM_RECENT,
  };
  chrome.history.search(query, function(results) {
    if (results) {
      console.log(results);
      if (callback) {
        callback(results);
      }
    }
  });
}

// Get page title of a url
function getPageTitle(url, callback) {
  console.log('getPageTitle:', url);
  $.ajax({
    url: url,
    // async: true,
    complete: function(data) {
      // console.log(data.responseText);
      var titleMatch = data.responseText.match(/<title>(.*?)<\/title>/);
      console.log('title matches:', titleMatch);
      if (callback) {
        callback({title: (titleMatch && titleMatch.length)
          ? titleMatch[1] : ''});
      }
    }
  });
}

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
  $('body').html('<div id="clipboard" contenteditable="true"></div>');
  var $clip = $('#clipboard');
  $clip.focus();

  // Execute paste and get data
  var text, links = [];
  if (document.execCommand('paste', true)) {
    // console.log('text:', $clip.text());
    text = $clip.text();
    // console.log('html:', $clip.html());
    var regex = /(?:href="|')(.*?)(?:"|')/gi;
    links = regex.exec($clip.html());
    console.log('urls:', links);
  }
  if (!links) {
    links = [];
  }
  if (text.match(/[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g)) {
    links.push(text);
  }

  // Cleanup and return value
  clipboard.parentNode.removeChild(clipboard);
  return {
    text: text,
    urls: links,
  };
}
