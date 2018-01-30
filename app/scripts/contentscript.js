'use strict';

// Prevent conflicts
jQuery.noConflict();
jQuery.hotkeys.options.filterInputAcceptingElements = false;
jQuery.hotkeys.options.filterContentEditable = false;

// Encapsulated anonymous function
(function($) {

  // Variables & Constants
  var KEYCODE_BACKSPACE = 8
    , KEYCODE_TAB = 9
    , KEYCODE_RETURN = 13
    , KEYCODE_SPACEBAR = 32

    , ANIMATION_FAST = 200
    , ANIMATION_NORMAL = 400
    , ANIMATION_SLOW = 1000
    , TIME_SHOW_CROUTON = 1000 * 3	              // Show croutons for 3s
    , WHITESPACE_REGEX = /(\s)/

    , ENUM_CAPITALIZATION_NONE = 0
    , ENUM_CAPITALIZATION_FIRST = 1
    , ENUM_CAPITALIZATION_ALL = 2

    , NAMESPACE = 'trackit'
    , EVENT_NAME_KEYPRESS = 'keypress.' + NAMESPACE
    , EVENT_NAME_KEYDOWN = 'keydown.' + NAMESPACE
    , EVENT_NAME_KEYUP = 'keyup.' + NAMESPACE
    , EVENT_NAME_BLUR = 'blur.' + NAMESPACE
    , EVENT_NAME_CLICK = 'click.' + NAMESPACE
    , EVENT_NAME_FOCUS = 'focus.' + NAMESPACE
    , EVENT_NAME_LOAD = 'load.' + NAMESPACE
    , EVENT_NAME_INSERTED = 'DOMNodeInserted'

    , SPOTLIGHT_INPUT = '*[contenteditable=true],textarea,input'
    , SPOTLIGHT_SHORTCUT = 'ctrl+space'
    , SPOTLIGHT_ID = NAMESPACE + '-spotlight'
    , SPOTLIGHT_SELECTOR = '#' + SPOTLIGHT_ID
    , SPOTLIGHT_INPUT_CLASS = NAMESPACE + '-spotlight-input'
    , SPOTLIGHT_INPUT_SELECTOR = '.' + SPOTLIGHT_INPUT_CLASS

    , SPOTLIGHT_PROJECT_DATA_ATTR = 'data-project'
    , SPOTLIGHT_PROJECT_C = 'COLLABORATION'
    , SPOTLIGHT_PROJECT_E = 'ENGAGE'
    , SPOTLIGHT_PROJECT_H = 'HUDDLE'
    , SPOTLIGHT_TYPE_DATA_ATTR = 'data-type'
    , SPOTLIGHT_TYPE_A = 'actionitem'
    , SPOTLIGHT_TYPE_D = 'decision'
  ;

  var typingBuffer = [];		// Keep track of what's been typed before timeout
  var typingTimeout;		 	// Delay before we clear buffer
  var keyPressEvent;			// Keep track of keypress event to prevent re-firing
  var keyUpEvent;				// Keep track of keyup event to prevent re-firing
  var clipboard;				// Keep track of what's in the clipboard
  var disableShortcuts;       // Flag to disable shortcuts in case of unreliable state

  // Custom log function
  function debugLog() {
    if (console) {
      console.log.apply(console, arguments);
    }
  }

  // When user presses SPOTLIGHT_SHORTCUT
  function activateSpotlight(event) {
    debugLog('activateSpotlight()');

    // Check if there's already a spotlight bar, and if so, just focus
    if ($(SPOTLIGHT_INPUT_SELECTOR).length > 0) {
      $(SPOTLIGHT_SELECTOR).fadeIn(ANIMATION_FAST, function() {
        $(SPOTLIGHT_INPUT_SELECTOR).focus();
      });
    } else {
      addSpotlightBar('body');
    }
  }

  // Add spotlight bar to element
  //  param: elementSelector should be a string
  function addSpotlightBar(elementSelector) {
    var d = document;
    $(d.createElement('form'))
      .attr('id', SPOTLIGHT_ID)
      .append($(d.createElement('input'))
        .addClass(SPOTLIGHT_INPUT_CLASS)
        .attr('type', 'text')
        .attr('placeholder', chrome.i18n.getMessage('SPOTLIGHT_PLACEHOLDER_ZERO'))
        // .on(EVENT_NAME_BLUR, hideSpotlight)
      )
      .hide()
      .appendTo(elementSelector)
      .fadeIn(ANIMATION_FAST, function() {
        addListeners(SPOTLIGHT_INPUT_SELECTOR);
        $(SPOTLIGHT_INPUT_SELECTOR).focus();
      });
  }

  // Hide the spotlight bar
  function hideSpotlight(callback) {
    $(SPOTLIGHT_SELECTOR).fadeOut(ANIMATION_FAST, function() {
      // Call callback if it is a function
      if (callback && typeof(callback) === 'function') {
        callback();
      }
    });
  }

  // When user presses a key
  function keyPressHandler(event)
  {
    debugLog('keyPressHandler:', event.target);

    // Make sure it's not the same event firing over and over again
    if (keyPressEvent == event) {
      return;
    } else {
      keyPressEvent = event;
    }

    // Get character that was typed
    var charCode = event.keyCode || event.which;
    if (charCode == KEYCODE_RETURN) {	// If return, clear and get out
      return clearTypingBuffer();
    }

    // Add new character to typing buffer
    var char = String.fromCharCode(charCode);
    typingBuffer.push(char);

    // Check typed text for shortcuts
    checkShortcuts(typingBuffer.join(''), char, event.target);
  }

  // When user lifts up on a key, to catch backspace
  function keyUpHandler(event)
  {
    // Clear field if empty
    if (event.target.value === ' ') {
      event.target.value = '';
    }

    // Make sure it's not the same event firing over and over again
    if (keyUpEvent == event) {
      return;
    } else {
      keyUpEvent = event;
    }

    // Get key that was lifted on
    var charCode = event.keyCode || event.which;

    // When user types backspace, pop character off buffer
    if (charCode == KEYCODE_BACKSPACE) {
      typingBuffer.pop(); // Remove last character typed

      // Clear data type if backspacing on empty field
      if (event.target.value === '') {
        var $spotlight = $(SPOTLIGHT_SELECTOR);
        if ($spotlight.attr(SPOTLIGHT_TYPE_DATA_ATTR)) {
          $spotlight.removeAttr(SPOTLIGHT_TYPE_DATA_ATTR);
          debugLog('removed type data attr');
        } else if ($spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR)) {
          $spotlight.removeAttr(SPOTLIGHT_PROJECT_DATA_ATTR);
          debugLog('removed project data attr');
        }
        updateSpotlightPlaceholderText();
      }
    }

    // If user uses tab or return, clear and get out
    if (charCode == KEYCODE_TAB || charCode == KEYCODE_RETURN || event.target.value === '') {
      return clearTypingBuffer();
    }
  }

  // Clears the typing buffer
  function clearTypingBuffer(event)
  {
    // Clear buffer
    typingBuffer.length = 0;
  }

  // Check for keywords
  function checkShortcuts(shortcut, lastChar, textInput) {
    debugLog('checkShortcuts:', lastChar, shortcut);

    var $spotlight = $(SPOTLIGHT_SELECTOR);
    shortcut = shortcut.toUpperCase();

    switch (shortcut) {
      case 'A: ': // Action item
      case 'D: ': // Decision
      case '#E ': // Project tag
      case '#C ':
      case '#H ':
      {
        // Update data attribute
        switch (shortcut) {
          case 'A: ': // Action item
            $spotlight.attr(SPOTLIGHT_TYPE_DATA_ATTR, SPOTLIGHT_TYPE_A);
            break;
          case 'D: ': // Decision
            $spotlight.attr(SPOTLIGHT_TYPE_DATA_ATTR, SPOTLIGHT_TYPE_D);
            break;
          case '#E ': // Project
            $spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR, SPOTLIGHT_PROJECT_E);
            break;
          case '#C ':
            $spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR, SPOTLIGHT_PROJECT_C);
            break;
          case '#H ':
            $spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR, SPOTLIGHT_PROJECT_H);
            break;
        }

        // Replace text in the input field
        replaceTextRegular(shortcut.trim(), '', textInput);
        updateSpotlightPlaceholderText();
      }
      break;
    }

    // If last character is whitespace, clear buffer
    if (WHITESPACE_REGEX.test(lastChar)) {
      clearTypingBuffer();
    }
  }

  // Update placeholder text to guide users based on state
  function updateSpotlightPlaceholderText() {
    var $spotlight = $(SPOTLIGHT_SELECTOR);
    var $textInput = $(SPOTLIGHT_INPUT_SELECTOR);
    var hasType = $spotlight.attr(SPOTLIGHT_TYPE_DATA_ATTR)
    , hasProject = $spotlight.attr(SPOTLIGHT_PROJECT_DATA_ATTR);

    if (hasType && hasProject) {
      $textInput.attr('placeholder', chrome.i18n.getMessage('SPOTLIGHT_PLACEHOLDER_BOTH'));
    } else if (hasType) {
      $textInput.attr('placeholder', chrome.i18n.getMessage('SPOTLIGHT_PLACEHOLDER_TYPE'));
    } else if (hasProject) {
      $textInput.attr('placeholder', chrome.i18n.getMessage('SPOTLIGHT_PLACEHOLDER_PROJECT'));
    } else {
      $textInput.attr('placeholder', chrome.i18n.getMessage('SPOTLIGHT_PLACEHOLDER_ZERO'));
    }
  }

  // // Check to see if text in argument corresponds to any shortcuts
  // function checkShortcuts(shortcut, lastChar, textInput)
  // {
  //   debugLog('checkShortcuts:', lastChar, shortcut);
  //
  //   var isAllCaps = (shortcut == shortcut.toUpperCase());   // Check for all caps
  //   var shortcutKey = SHORTCUT_PREFIX + shortcut;           // Key for expansion
  //   var shortcutKeyLowercase = SHORTCUT_PREFIX + shortcut.toLowerCase(); // For auto-capitalization
  //
  //   // Get shortcuts
  //   chrome.storage.sync.get(shortcutKey, function (data)
  //   {
  //     // Check for errors
  //     if (chrome.runtime.lastError) {
  //       console.log(chrome.runtime.lastError);
  //     }
  //     // Check that data is returned and shortcut exists
  //     else if (data && Object.keys(data).length)
  //     {
  //       processAutoTextExpansion(shortcut, data[shortcutKey], lastChar, textInput);
  //     }
  //
  //     // No expansion for the shortcut, see if case is different
  //     else if (shortcutKeyLowercase != shortcutKey)
  //     {
  //       // Check to see if there is a result lowercase version,
  //       //  and if yes, then do auto-capitalization instead
  //       chrome.storage.sync.get(shortcutKeyLowercase, function (data)
  //       {
  //         // Check for errors
  //         if (chrome.runtime.lastError) {
  //           console.log(chrome.runtime.lastError);
  //         }
  //         // Check that data is returned and shortcut exists
  //         else if (data && Object.keys(data).length)
  //         {
  //           processAutoTextExpansion(shortcut,
  //             data[shortcutKeyLowercase],
  //             lastChar,
  //             textInput,
  //             (isAllCaps ? ENUM_CAPITALIZATION_ALL : ENUM_CAPITALIZATION_FIRST)
  //           );
  //         }
  //       });
  //     }
  //
  //     // If last character is whitespace, clear buffer
  //     if (WHITESPACE_REGEX.test(lastChar)) {
  //       clearTypingBuffer();
  //     }
  //   });
  // }

  // Process autotext expansion and replace text
  function processAutoTextExpansion(shortcut, autotext, lastChar, textInput, capitalization)
  {
    debugLog('processAutoTextExpansion:', autotext, capitalization);

    // Check if shortcut exists and should be triggered
    if (autotext && textInput)
    {
      // If shortcuts are disabled, abort early
      if (disableShortcuts) {
        return;
      }

      // Update / get clipboard text
      getClipboardData(function()
      {
        // // Handle clipboard pastes
        // autotext = processClips(autotext);
        //
        // // Handle moment.js dates
        // autotext = processDates(autotext);
        //
        // // Handle %url% macro
        // autotext = processUrls(autotext);

        // Adjust capitalization
        switch (capitalization)
        {
          case ENUM_CAPITALIZATION_FIRST:
            autotext = autotext.charAt(0).toUpperCase() + autotext.slice(1);
            break;

          case ENUM_CAPITALIZATION_ALL:
            autotext = autotext.toUpperCase();
            break;

          default: break;
        }

        // Setup for processing
        var domain = window.location.host;
        debugLog('textInput: ', textInput);

        // If input or textarea field, can easily change the val
        if (textInput.nodeName == 'TEXTAREA' || textInput.nodeName == 'INPUT')
        {
          // Add whitespace if was last character
          if (WHITESPACE_REGEX.test(lastChar)) {
            autotext += lastChar;
          }

          replaceTextRegular(shortcut, autotext, textInput);
        }
        else	// Trouble... editable divs & special cases
        {
          // Add whitespace if was last character
          if (lastChar == ' ') {
            autotext += '&nbsp;';
          } else if (lastChar == '\t') {
            autoText += '&#9;';
          }

          debugLog('Domain:', domain);
          replaceTextContentEditable(shortcut, autotext, findFocusedNode());
        }

        // Always clear the buffer after a shortcut fires
        clearTypingBuffer();
      });	// END - getClipboardData()
    }	// END - if (autotext)
    else {  // Error
      console.log('Invalid input, missing autotext or textinput parameters.');
    }
  }

  // Specific handler for regular textarea and input elements
  function replaceTextRegular(shortcut, autotext, textInput)
  {
    var cursorPosition = getCursorPosition(textInput);

    var newText = replaceText(
      textInput.value,
      shortcut,
      autotext,
      cursorPosition
    );
    debugLog(newText);
    textInput.value = newText;
    setCursorPosition(textInput, cursorPosition - shortcut.length + autotext.length);
  }

  // Reusable handler for editable iframe text replacements
  function replaceTextContentEditable(shortcut, autotext, node, win)
  {
    // Find focused div instead of what's receiving events
    var textInput = node.parentNode;
    debugLog(textInput);

    // Get and process text, update cursor position
    var cursorPosition = getCursorPosition(textInput, win)
      , text = replaceHTML(node.textContent, shortcut, autotext, cursorPosition)
      , multiline = false
      , lines
    ;

    // If autotext is multiline text, split by newlines, join with <br> tag instead
    if (autotext.indexOf('\n') >= 0)
    {
      lines = text.split('\n');
      text = lines.join('<br>');
      multiline = true;
    }

    // A way to insert HTML into a content editable div with raw JS.
    //  Creates an element with the HTML content, then transfers node by node
    //  to a new Document Fragment that replaces old node
    //  Source from: http://stackoverflow.com/questions/6690752/insert-html-at-caret-in-a-contenteditable-div
    var el = document.createElement('div')          // Used to store HTML
      , frag = document.createDocumentFragment()  // To replace old node
      , cursorNode;                               // To track cursor position
    el.innerHTML = text;                            // Set HTML to div, then move to frag
    for (var tempNode; tempNode = el.firstChild; frag.appendChild(tempNode))
    {
      debugLog(tempNode.nodeType, tempNode);
      if (tempNode.nodeType === Node.COMMENT_NODE
        && tempNode.nodeValue == CURSOR_TRACKING_TAG) {
        cursorNode = tempNode;
      }
    }
    textInput.replaceChild(frag, node);             // Replace old node with frag

    // Set cursor position based off tracking node (or last child if we
    //  weren't able to find the cursor tracker), then remove tracking node
    setCursorPositionAfterNode(cursorNode || textInput.lastChild, win);
    if (cursorNode) {
      cursorNode.parentNode.removeChild(cursorNode);
    }
  }

  // Replacing shortcut with autotext in text at cursorPosition
  function replaceText(text, shortcut, autotext, cursorPosition)
  {
    debugLog('cursorPosition:', cursorPosition);
    debugLog('currentText:', text);
    debugLog('shortcut:', shortcut);
    debugLog('expandedText:', autotext);

    // Replace shortcut based off cursorPosition
    return [text.slice(0, cursorPosition - shortcut.length),
      autotext, text.slice(cursorPosition)].join('');
  }

  // Replacing shortcut with autotext HTML content at cursorPosition
  function replaceHTML(text, shortcut, autotext, cursorPosition)
  {
    debugLog('cursorPosition:', cursorPosition);
    debugLog('currentText:', text);
    debugLog('shortcut:', shortcut);
    debugLog('expandedText:', autotext);

    // If autotext expansion already has cursor tag in it, don't insert
    var cursorTag = (autotext.indexOf(CURSOR_TRACKING_HTML) >= 0)
      ? '' : CURSOR_TRACKING_HTML;

    // Replace shortcut based off cursorPosition,
    //  insert tracking tag for cursor if it isn't already defined in autotext
    return [text.slice(0, cursorPosition - shortcut.length),
      autotext, cursorTag, text.slice(cursorPosition)].join('');
  }

    // Find node that has text contents that matches text
  function findMatchingTextNode(div, text)
  {
    return $(div).contents().filter(function() {
      return (this.nodeType == Node.TEXT_NODE)	    // Return all text nodes
        && (this.nodeValue.length == text.length);	// with same text length
    }).filter(function() {
      return (this.nodeValue == text);	// Filter for same text
    }).first().get(0);
  }

  // Find node that user is editing right now, for editable divs
  //  Optional passed window to perform selection find on
  function findFocusedNode(win)
  {
    // Use default window if not given window to search in
    if (!win) {
      win = window;
    }

    // Look for selection
    if (win.getSelection) {
      var selection = win.getSelection();
      if (selection.rangeCount) {
        return selection.getRangeAt(0).startContainer;
      }
    }
    return null;
  }

  // Returns the first match for a parent matching the given tag and classes.
  //  Tag parameter should be a string, el is the element to query on, and
  //  classes should be an array of strings of the names of the classes.
  function hasParentSelector(el, tag, classes)
  {
    tag = tag.toUpperCase();
    var found = false;
    while (el.parentNode && !found)
    {
      el = el.parentNode;     // Check parent
      if (el && el.tagName == tag) {
        for (var i = 0; i < classes.length; i++)
        {
          if (!el.classList.contains(classes[i])) {
            break;
          }
          found = true;   // Found = true if element has all classes
          break;          // Break to while loop
        }
      }
    }
    return el;
  }

  // Cross-browser solution for getting cursor position
  function getCursorPosition(el, win, doc)
  {
    var pos = 0, sel;
    if (!win) {
      win = window;
    }
    if (!doc) {
      doc = document;
    }
    if (el.nodeName == 'INPUT' || el.nodeName == 'TEXTAREA')
    {
      try { 	// Needed for new input[type=email] failing
        pos = el.selectionStart;
      } catch (exception) {
        console.log('getCursorPosition:', exception);
      }
    }
    else	// Other elements
    {
      sel = win.getSelection();
      if (sel.rangeCount) {
        pos = sel.getRangeAt(0).endOffset;
      }
    }
    return pos;
  }


  // Cross-browser solution for setting cursor position
  function setCursorPosition(el, pos)
  {
    debugLog('setCursorPosition:', pos);
    var sel, range;
    if (el.nodeName == 'INPUT' || el.nodeName == 'TEXTAREA') {
      try {	// Needed for new input[type=email] failing
        if (el.setSelectionRange) {
          el.setSelectionRange(pos, pos);
        } else if (el.createTextRange) {
          range = el.createTextRange();
          range.collapse(true);
          range.moveEnd('character', pos);
          range.moveStart('character', pos);
          range.select();
        }
      } catch (exception) {
        console.log('setCursorPosition', exception);
      }
    } else {	// Other elements
      var node = el.childNodes[0];	// Need to get text node
      if (window.getSelection && document.createRange) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(true);
        range.setEnd(node, pos);
        range.setStart(node, pos);
        sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } else if (document.body.createTextRange) {
        range = document.body.createTextRange();
        range.moveToElementText(el);
        range.collapse(true);
        range.setEnd(node, pos);
        range.setStart(node, pos);
        range.select();
      }
    }
  }

  // Sets cursor position after a specific node, and optional
  //  parameter to set what the window/document should be
  function setCursorPositionAfterNode(node, win, doc)
  {
    debugLog('setCursorPositionAfterNode:', node);

    // Setup variables
    var sel, range;
    if (!win) {
      win = window;
    }
    if (!doc) {
      doc = document;
    }

    // Check for getSelection(), if not available, try createTextRange
    if (win.getSelection && doc.createRange)
    {
      range = doc.createRange();
      range.setStartAfter(node);
      range.collapse(true);
      sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    else if (doc.body.createTextRange)
    {
      range = doc.body.createTextRange();
      range.setStartAfter(node);
      range.collapse(true);
      range.select();
    }
  }

  // Sets cursor position for a specific node, and optional
  //  parameter to set what the window/document should be
  function setCursorPositionInNode(node, pos, win, doc)
  {
    debugLog('setCursorPositionInNode:', pos);

    // Setup variables
    var sel, range;
    if (!win) {
      win = window;
    }
    if (!doc) {
      doc = document;
    }

    // Check for getSelection(), if not available, try createTextRange
    if (win.getSelection && doc.createRange)
    {
      range = doc.createRange();
      range.setEnd(node, pos);
      range.setStart(node, pos);
      sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    else if (doc.body.createTextRange)
    {
      range = doc.body.createTextRange();
      range.setEnd(node, pos);
      range.setStart(node, pos);
      range.select();
    }
  }

  // Remove classes that start with a prefix
  //  param: $target should be a jQuery object
  function removeClassesStartingWith($target, prefix) {
    $target.removeClass(function (index, className) {
      return (className.match(new RegExp('/(^|\s)' + prefix + '\S+/g')) || []).join(' ');
    });
  }

  // // Process and replace %url% tags with content from current url
  // function processUrls(text)
  // {
  //   var url = window.location.href;
  //   return text.replace(URL_MACRO_REGEX, url);
  // }
  //
  // // Process and replace clip tags with content from clipboard
  // function processClips(text)
  // {
  //   debugLog('processClips', text);
  //
  //   // Find all indices of opening tags
  //   var clipTags = [];
  //   while (result = CLIP_MACRO_REGEX.exec(text)) {
  //     clipTags.push(result.index);
  //   }
  //
  //   // Only continue if we have any tags
  //   if (!clipTags.length) {
  //     return text;
  //   }
  //   debugLog('clipTags:', clipTags);
  //
  //   // Loop through and replace clip tags with clipboard pasted text
  //   var processedText = [text.slice(0, clipTags[0])];
  //   debugLog(processedText);
  //   for (var i = 0, len = clipTags.length; i < len; ++i)
  //   {
  //     processedText.push(clipboard);
  //     debugLog('pre', processedText);
  //     processedText.push(text.slice(clipTags[i] + 6,	// 6 for '%clip%'
  //       (i == len - 1) ? undefined : clipTags[i+1]));
  //     debugLog('post', processedText);
  //   }
  //
  //   // Return processed dates
  //   return processedText.join('');
  // }
  //
  // // Get what's stored in the clipboard
  // function getClipboardData(completionBlock) {
  //   chrome.runtime.sendMessage({
  //     request:'getClipboardData'
  //   }, function(data) {
  //     debugLog('getClipboardData:', data);
  //     clipboard = data.paste;
  //     if (completionBlock) {
  //       completionBlock();
  //     }
  //   });
  // }

  // Attach listener to keypresses
  function addListeners(elementSelector) {
    debugLog('addListeners:', elementSelector);

    // Add default listeners to element
    var $target = $(elementSelector);
    $target.on(EVENT_NAME_KEYPRESS, keyPressHandler);
    $target.on(EVENT_NAME_KEYUP, keyUpHandler);
    $target.on(EVENT_NAME_BLUR, clearTypingBuffer);
    $target.on(EVENT_NAME_CLICK, clearTypingBuffer);
  }

  // Detach listener for keypresses
  function removeListeners(elementSelector)
  {
    var $target = $(elementSelector);
    $target.off(EVENT_NAME_KEYPRESS);
    $target.off(EVENT_NAME_KEYUP);
    $target.off(EVENT_NAME_LOAD);
    $target.off(EVENT_NAME_BLUR);
  }

  // Attach listener for spotlight shortcut
  function addSpotlightListener() {
    debugLog('addSpotlightListener()');
    $(document).on(EVENT_NAME_KEYDOWN, null, SPOTLIGHT_SHORTCUT, activateSpotlight);
  }

  // Detach listener for spotlight shortcut
  function removeSpotlightListener() {
    $(document).off(EVENT_NAME_KEYDOWN);
  }

  // Create and show a warning message crouton that can be dismissed or autohide
  function showCrouton(message, autohide)
  {
    // Create and style crouton
    var crouton = document.createElement('div');
    crouton.style['width'] = '100%';
    crouton.style['position'] = 'fixed';
    crouton.style['bottom'] = 0;
    crouton.style['left'] = 0;
    crouton.style['right'] = 0;
    crouton.style['padding'] = '4px 0';
    crouton.style['text-align'] = 'center';
    crouton.style['font'] = 'bold 13px/16px Verdana';
    crouton.style['color'] = '#fff';
    crouton.style['background-color'] = '#c66';
    crouton.style['opacity'] = '.8';

    // Add to body, add content
    var $crouton = $(crouton);
    $('body').append($crouton.text(message));

    if (autohide) {
      $crouton.delay(TIME_SHOW_CROUTON).remove();
    }
    else    // Show a close button
    {
      // Create and style close button
      var button = document.createElement('button');
      button.style['font'] = 'bold 13px/13px Verdana';
      button.style['margin'] = '0 6px';
      button.style['padding'] = '4px';
      button.style['float'] = 'right';

      // Add to body, add content, and actions
      $crouton.append($(button)
        .text('x')
        .click(function(e) {
          $(this).parent().remove();
        })
      );
    }
  }

  // Document ready function
  $(function() {
    addSpotlightListener();         // Add listener for keyboard shortcut
	});

})(jQuery);
