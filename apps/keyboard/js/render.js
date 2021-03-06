/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Render is in charge of draw and composite HTML elements under requestion
// of the IMEController. IMERender is able to read from the layout to improve
// its performance but is not allowed to communicate with the controller nor
// manager.
//
// XXX: The only thing worth to be remebered is the KEY element must be the
// deepest interactive HTML element on the hierarchy or, if none, simply the
// deepest element. This element must contain dataset-keycode and related
// attributes.
const IMERender = (function() {

  var ime, menu;
  var getUpperCaseValue, isSpecialKey;

  var _menuKey, _altContainer;

  var layoutWidth = 10;

  var numberOfCandidatesPerRow = 8;
  var candidateUnitWidth;

  var inputMethodName; // used as a CSS class on the candidatePanel

  // Initialize the render. It needs some business logic to determine:
  //   1- The uppercase for a key object
  //   2- When a key is a special key
  var init = function kr_init(uppercaseFunction, keyTest) {
    getUpperCaseValue = uppercaseFunction;
    isSpecialKey = keyTest;
    this.ime = document.getElementById('keyboard');
  };

  var setInputMethodName = function(name) {
    var candidatePanel = document.getElementById('keyboard-candidate-panel');
    if (candidatePanel) {
      if (inputMethodName)
        candidatePanel.classList.remove(inputMethodName);
      candidatePanel.classList.add(name);
    }
    var togglebutton =
      document.getElementById('keyboard-candidate-panel-toggle-button');
    if (togglebutton) {
      if (inputMethodName)
        togglebutton.classList.remove(inputMethodName);
      togglebutton.classList.add(name);
    }

    inputMethodName = name;
  };

  // Accepts three values: true / 'locked' / false
  //   Use 'locked' when caps are locked
  //   Use true when uppercase is enabled
  //   Use false when uppercase if disabled
  var setUpperCaseLock = function kr_setUpperCaseLock(state) {
    var capsLockKey = document.querySelector(
      'button[data-keycode="' + KeyboardEvent.DOM_VK_CAPS_LOCK + '"]'
    );

    if (!capsLockKey)
      return;

    if (state === 'locked') {
      capsLockKey.classList.remove('kbr-key-active');
      capsLockKey.classList.add('kbr-key-hold');
    } else if (state) {
      capsLockKey.classList.add('kbr-key-active');
      capsLockKey.classList.remove('kbr-key-hold');
    } else {
      capsLockKey.classList.remove('kbr-key-active');
      capsLockKey.classList.remove('kbr-key-hold');
    }
  };

  // Draw the keyboard and its components. Meat is here.
  var draw = function kr_draw(layout, flags) {
    flags = flags || {};

    // change scale (Our target screen width is 320px)
    // TODO get document.documentElement.style.fontSize
    // and use it for multipling changeScale deppending on the value of pixel
    // density used in media queries

    layoutWidth = layout.width || 10;
    var totalWidth = document.getElementById('keyboard').clientWidth;
    var placeHolderWidth = totalWidth / layoutWidth;
    var inputType = flags.inputType || 'text';

    layout.upperCase = layout.upperCase || {};

    var content = document.createDocumentFragment();
    layout.keys.forEach((function buildKeyboardRow(row, nrow) {
      var kbRow = document.createElement('div');
      var rowLayoutWidth = 0;
      kbRow.classList.add('keyboard-row');
      if (nrow === layout.keys.length - 1) {
        kbRow.classList.add('keyboard-last-row');
      }
      row.forEach((function buildKeyboardColumns(key, ncolumn) {

        var keyChar = key.value;

        // Keys may be hidden if the .hidden property contains the inputType
        if (key.hidden && key.hidden.indexOf(flags.inputType) !== -1)
          return;

        // Keys may be visible if the .visibile property contains the inputType
        if (key.visible && key.visible.indexOf(flags.inputType) === -1)
          return;

        // Handle uppercase
        if (flags.uppercase) {
          keyChar = getUpperCaseValue(key);
        }

        // Handle override
        var code = key.keyCode || keyChar.charCodeAt(0);

        var className = '';
        if (isSpecialKey(key)) {
          className = 'special-key';
        } else if (layout.keyClassName) {
          className = layout.keyClassName;
        }

        var ratio = key.ratio || 1;
        rowLayoutWidth += ratio;

        var keyWidth = placeHolderWidth * ratio;
        var dataset = [{'key': 'row', 'value': nrow}];
        dataset.push({'key': 'column', 'value': ncolumn});
        dataset.push({'key': 'keycode', 'value': code});
        if (key.compositeKey) {
          dataset.push({'key': 'compositekey', 'value': key.compositeKey});
        }

        kbRow.appendChild(buildKey(keyChar, className, keyWidth + 'px',
          dataset, key.altNote));
      }));

      kbRow.dataset.layoutWidth = rowLayoutWidth;

      content.appendChild(kbRow);
    }));

    // Append empty accent char menu and key highlight into content
    var accentMenuContainer = document.createElement('span');
    accentMenuContainer.setAttribute('id', 'keyboard-accent-char-menu-out');
    var accentMenu = document.createElement('span');
    accentMenu.setAttribute('id', 'keyboard-accent-char-menu');
    var highlight = document.createElement('span');
    highlight.setAttribute('id', 'keyboard-key-highlight');

    accentMenuContainer.appendChild(accentMenu);

    this.ime.innerHTML = '';

    content.appendChild(accentMenuContainer);
    content.appendChild(highlight);

    this.ime.appendChild(content);
    this.menu = document.getElementById('keyboard-accent-char-menu');

    // Builds candidate panel
    if (flags.showCandidatePanel) {
      this.ime.insertBefore(
        candidatePanelToggleButtonCode(), this.ime.firstChild);
      this.ime.insertBefore(candidatePanelCode(), this.ime.firstChild);
      this.ime.insertBefore(pendingSymbolPanelCode(), this.ime.firstChild);
      showPendingSymbols('');
      showCandidates([], true);

      this.ime.classList.add('candidate-panel');
    } else {
      this.ime.classList.remove('candidate-panel');
    }

    resizeUI(layout);
  };

  var showIME = function hm_showIME() {
    delete this.ime.dataset.hidden;
    this.ime.classList.remove('hide');
  };

  var hideIME = function km_hideIME() {
    this.ime.dataset.hidden = 'true';
  };

  // Highlight a key
  var highlightKey = function kr_updateKeyHighlight(key, alternativeKey) {
    key.classList.add('highlighted');

    if (alternativeKey) {
      var spanToReplace = key.querySelector('.visual-wrapper span');
      spanToReplace.textContent = alternativeKey;
    }
  };

  // Unhighlight a key
  var unHighlightKey = function kr_unHighlightKey(key) {
    key.classList.remove('highlighted');
  };

  // Show pending symbols with highlight (selection) if provided
  var showPendingSymbols = function km_showPendingSymbols(symbols,
                                                          highlightStart,
                                                          highlightEnd,
                                                          highlightState) {
    var HIGHLIGHT_COLOR_TABLE = {
      'red': 'keyboard-pending-symbols-highlight-red',
      'green': 'keyboard-pending-symbols-highlight-green',
      'blue': 'keyboard-pending-symbols-highlight-blue'
    };

    // TODO: Save the element
    var pendingSymbolPanel =
      document.getElementById('keyboard-pending-symbol-panel');

    if (pendingSymbolPanel) {

      if (typeof highlightStart === 'undefined' ||
        typeof highlightEnd === 'undefined' ||
        typeof highlightState === 'undefined') {
        pendingSymbolPanel.textContent = symbols;
        return;
      }

      var span = document.createElement('span');
      span.className = HIGHLIGHT_COLOR_TABLE[highlightState];
      span.textContent = symbols.slice(highlightStart, highlightEnd);

      pendingSymbolPanel.innerHTML = '';
      pendingSymbolPanel.appendChild(span);
      pendingSymbolPanel.appendChild(
        document.createTextNode(symbols.substr(highlightEnd)));
    }
  };

  var toggleCandidatePanel = function(expand) {
    var candidatePanel = document.getElementById('keyboard-candidate-panel');
    candidatePanel.scrollTop = candidatePanel.scrollLeft = 0;

    if (expand) {
      IMERender.ime.classList.remove('candidate-panel');
      IMERender.ime.classList.add('full-candidate-panel');
    } else {
      IMERender.ime.classList.remove('full-candidate-panel');
      IMERender.ime.classList.add('candidate-panel');
    }

    resizeCandidatePanelToggleButton();
  };

  var resizeCandidatePanelToggleButton = function() {
    var candidatePanelToggleButton =
      document.getElementById('keyboard-candidate-panel-toggle-button');

    if (candidatePanelToggleButton) {
      candidatePanelToggleButton.style.width =
        (IMERender.isFullCandidataPanelShown() ?
         candidateUnitWidth - 8 : candidateUnitWidth) + 'px';
    }
  };

  var isFullCandidataPanelShown = function() {
    return IMERender.ime.classList.contains('full-candidate-panel');
  };

  // Show candidates
  // Each candidate is a string or an array of two strings
  var showCandidates = function(candidates, noWindowHeightUpdate) {
    // TODO: Save the element
    var candidatePanel = document.getElementById('keyboard-candidate-panel');
    var candidatePanelToggleButton =
      document.getElementById('keyboard-candidate-panel-toggle-button');

    if (candidatePanel) {
      candidatePanel.dataset.candidateIndicator = 0;

      candidatePanel.innerHTML = '';
      candidatePanel.scrollTop = candidatePanel.scrollLeft = 0;

      var docFragment = document.createDocumentFragment();

      if (inputMethodName == 'latin') {
        candidates.forEach(function buildCandidateEntry(candidate) {
          // Make sure all of the candidates are defined
          if (!candidate) return;

          // Each candidate gets its own div
          var div = document.createElement('div');
          // Size the div based on the # of candidates (-2% for margins)
          div.style.width = (100 / candidates.length - 2) + '%';
          docFragment.appendChild(div);

          var text, data, correction = false;
          if (typeof candidate === 'string') {
            if (candidate[0] === '*') { // it is an autocorrection candidate
              candidate = candidate.substring(1);
              correction = true;
            }
            data = text = candidate;
          }
          else {
            text = candidate[0];
            data = candidate[1];
          }

          var span = fitText(div, text);
          span.dataset.selection = true;
          span.dataset.data = data;
          if (correction)
            span.classList.add('autocorrect');

          // Put the text in a span and make it fit in the container
          function fitText(container, text) {
            container.textContent = '';
            if (!text)
              return null;
            var span = document.createElement('span');
            span.textContent = text;
            container.appendChild(span);

            // Measure the width of the element, and return the scale that
            // we can use to make it fit in the container. The return values
            // are restricted to a set that matches the standard font sizes
            // we use in Gaia.
            //
            // Note that this only works if the element is display:inline
            function getScale(element, container) {
              var elementWidth = element.getBoundingClientRect().width;
              var s = container.clientWidth / elementWidth;
              if (s >= 1)
                return 1;    // 10pt font "Body Large"
              if (s >= .8)
                return .8;   // 8pt font "Body"
              if (s >= .7)
                return .7;   // 7pt font "Body Medium"
              if (s >= .65)
                return .65;  // 6.5pt font "Body Small"
              if (s >= .6)
                return .6;   // 6pt font "Body Mini"
              return s;      // Something smaller than 6pt.
            }

            var limit = .6;  // Dont use a scale smaller than this
            var scale = getScale(span, container);

            // If the text does not fit within the scaling limit,
            // reduce the length of the text by replacing characters in
            // the middle with ...
            if (scale < limit) {
              var charactersReplaced = text.length % 2;
              while (scale < limit && charactersReplaced < text.length - 2) {
                charactersReplaced += 2;
                var halflen = (text.length - charactersReplaced) / 2;
                span.textContent = text.substring(0, halflen) +
                  '…' +
                  text.substring(text.length - halflen);
                scale = getScale(span, container);
              }
            }

            // The scaling and centering we do only works if the span
            // is display:block or inline-block
            span.style.display = 'inline-block';
            if (scale < 1) {
              span.style.width = (100 / scale) + '%';
              span.style.transformOrigin = 'left';
              span.style.transform = 'scale(' + scale + ')';
            }
            else {
              span.style.width = '100%';
            }

            return span;
          }
        });
      } else {
        candidatePanelToggleButton.style.display = 'none';
        docFragment = candidatesFragmentCode(1, candidates, true);
      }

      candidatePanel.appendChild(docFragment);
    }
  };

  var showMoreCandidates = function(rowLimit, candidates) {
    if (!rowLimit) rowLimit = -1;
    if (!candidates) return;
    document.getElementById('keyboard-candidate-panel').appendChild(
      candidatesFragmentCode(rowLimit, candidates)
    );
  };

  var getNumberOfCandidatesPerRow = function() {
    return numberOfCandidatesPerRow;
  };

  var candidatesFragmentCode = function(rowLimit, candidates, indentFirstRow) {
    var candidatePanel = document.getElementById('keyboard-candidate-panel');
    var candidatePanelToggleButton =
      document.getElementById('keyboard-candidate-panel-toggle-button');

    var docFragment = document.createDocumentFragment();
    if (candidates.length == 0) {
      return docFragment;
    }

    var rowDiv = document.createElement('div');
    rowDiv.classList.add('candidate-row');
    if (indentFirstRow) {
      rowDiv.classList.add('candidate-row-first');
    }

    var nowUnit = 0;
    var rowCount = 0;

    if (rowLimit < 0) {
      rowLimit = Number.Infinity;
    }

    var candidatesLength = candidates.length;

    for (var i = 0; i < candidatesLength; i++) {
      var cand = candidates[i][0];
      var data = candidates[i][1];
      var span = document.createElement('span');
      var unit = (cand.length >> 1) + 1;

      span.textContent = cand;
      span.dataset.selection = true;
      span.dataset.data = data;
      span.style.width = (unit * candidateUnitWidth - 2) + 'px';

      nowUnit += unit;

      var needBreak = false;
      if (rowCount == 0 && indentFirstRow &&
          nowUnit == numberOfCandidatesPerRow && i != candidatesLength - 1) {
        needBreak = true;
      }

      if (nowUnit > numberOfCandidatesPerRow || needBreak) {
        if (rowCount == 0) {
          candidatePanelToggleButton.style.display = 'block';
        }

        if (rowCount >= rowLimit - 1) {
          break;
        }

        docFragment.appendChild(rowDiv);
        rowCount++;

        rowDiv = document.createElement('div');
        rowDiv.classList.add('candidate-row');
        nowUnit = unit;
      }

      rowDiv.appendChild(span);
    }

    if (i != candidatesLength) {
      candidatePanel.dataset.truncated = true;
    } else {
      delete candidatePanel.dataset.truncated;
    }

    candidatePanel.dataset.rowCount = rowCount + 1;
    candidatePanel.dataset.candidateIndicator =
      parseInt(candidatePanel.dataset.candidateIndicator) + i;

    docFragment.appendChild(rowDiv);
    rowDiv = null;

    return docFragment;
  };

  // Show keyboard layout alternatives
  var showKeyboardAlternatives = function(key, keyboards, current, switchCode) {
    var menuContainer = document.createElement('div');
    menuContainer.classList.add('menu-container');
    var dataset, className;
    var menu = this.menu;

    var cssWidth = key.style.width;
    menu.classList.add('kbr-menu-lang');

    var alreadyAdded = {};
    for (var i = 0, kbr; kbr = keyboards[i]; i += 1) {
      if (alreadyAdded[kbr])
        continue;

      className = 'keyboard-key';
      if (kbr === current)
        className += ' kbr-key-hold';

      dataset = [
        {key: 'keyboard', value: kbr},
        {key: 'keycode', value: switchCode}
      ];

      menuContainer.appendChild(buildKey(
        Keyboards[kbr].menuLabel,
        className, cssWidth + 'px',
        dataset)
      );

      alreadyAdded[kbr] = true;
    }
    menu.innerHTML = '';
    menu.appendChild(menuContainer);

    // Replace with the container
    _altContainer = document.createElement('div');
    _altContainer.style.display = 'inline-block';
    _altContainer.style.width = key.style.width;
    _altContainer.innerHTML = key.innerHTML;
    _altContainer.className = key.className;
    _altContainer.classList.add('kbr-menu-on');
    _menuKey = key;
    key.parentNode.replaceChild(_altContainer, key);

    _altContainer
      .querySelectorAll('.visual-wrapper > span')[0]
      .appendChild(menu);
    menu.style.display = 'block';
  };

  // Show char alternatives.
  var showAlternativesCharMenu = function(key, altChars) {
    var content = document.createDocumentFragment();
    var left = (window.innerWidth / 2 > key.offsetLeft);

    // Place the menu to the left
    if (!left) {
      this.menu.classList.add('kbr-menu-left');
      altChars = altChars.reverse();
    }

    // How wide (in characters) is the key that we're displaying
    // these alternatives for?
    var keycharwidth = key.dataset.compositeKey ?
      key.dataset.compositeKey.length : 1;

    // Build a key for each alternative
    altChars.forEach(function(alt, index) {
      var dataset = alt.length == 1 ?
        [{'key': 'keycode', 'value': alt.charCodeAt(0)}] :
        [{'key': 'compositekey', 'value': alt}];

      // Make each of these alternative keys 75% as wide as the key that
      // it is an alternative for, but adjust for the relative number of
      // characters in the original and the alternative
      var width = 0.75 * key.offsetWidth / keycharwidth * alt.length;
      // If there is only one alternative, or we are showing the first
      // alternative character, then display it at least as wide as the
      // original key.
      if (altChars.length === 1 ||
          (left && index === 0) ||
          (!left && index === altChars.length - 1))
        width = Math.max(width, key.offsetWidth);

      content.appendChild(buildKey(alt, '', width + 'px', dataset));
    });
    this.menu.innerHTML = '';
    this.menu.appendChild(content);

    // Replace with the container
    _altContainer = document.createElement('div');
    _altContainer.style.display = 'inline-block';
    _altContainer.style.width = key.style.width;
    _altContainer.innerHTML = key.innerHTML;
    _altContainer.className = key.className;
    _altContainer.classList.add('kbr-menu-on');
    _menuKey = key;
    key.parentNode.replaceChild(_altContainer, key);

    // Adjust menu style
    _altContainer
      .querySelectorAll('.visual-wrapper > span')[0]
      .appendChild(this.menu);
    this.menu.style.display = 'block';

    // Adjust offset when alternatives menu overflows
    var alternativesLeft = getWindowLeft(this.menu);
    var alternativesRight = alternativesLeft + this.menu.offsetWidth;

    var offset;
    // It overflows on the right
    if (left && alternativesRight > window.innerWidth) {
      console.log('overflowing right');
      offset = window.innerWidth - alternativesRight;
      console.log(offset);
      this.menu.style.left = offset + 'px';

      // It overflows on the left
    } else if (!left && alternativesLeft < 0) {
      console.log('overflowing left');
      offset = alternativesLeft;
      console.log(offset);
      this.menu.style.right = offset + 'px';
    }
  };

  // Hide the alternative menu
  var hideAlternativesCharMenu = function km_hideAlternativesCharMenu() {
    this.menu = document.getElementById('keyboard-accent-char-menu');
    this.menu.style.display = 'none';
    this.menu.className = '';
    this.menu.innerHTML = '';

    if (_altContainer)
      _altContainer.parentNode.replaceChild(_menuKey, _altContainer);

    this.menu.style.left = '';
    this.menu.style.right = '';
  };

  var _keyArray = []; // To calculate proximity info for predictive text

  // Recalculate dimensions for the current render
  var resizeUI = function(layout) {
    var changeScale;

    // Font size recalc
    var ime = document.getElementById('keyboard');
    if (window.innerWidth <= window.innerHeight) {
      changeScale = window.innerWidth / 32;
      document.documentElement.style.fontSize = changeScale + 'px';
      ime.classList.remove('landscape');
      ime.classList.add('portrait');
    } else {
      changeScale = window.innerWidth / 64;
      document.documentElement.style.fontSize = changeScale + 'px';
      ime.classList.remove('portrait');
      ime.classList.add('landscape');
    }


    _keyArray = [];

    // Width calc
    if (layout) {
      var keyboard = document.getElementById('keyboard');

      // Remove inline styles on rotation
      [].forEach.call(keyboard.querySelectorAll('.visual-wrapper[style]'),
        function(item) {
          item.style.width = '';
        });

      layoutWidth = layout.width || 10;
      var totalWidth = keyboard.clientWidth;
      var placeHolderWidth = totalWidth / layoutWidth;

      var ratio, keys, rows = document.querySelectorAll('.keyboard-row');
      for (var r = 0, row; row = rows[r]; r += 1) {
        var rowLayoutWidth = parseInt(row.dataset.layoutWidth, 10);
        keys = row.childNodes;
        for (var k = 0, key; key = keys[k]; k += 1) {
          ratio = layout.keys[r][k].ratio || 1;

          key.style.width = Math.floor(placeHolderWidth * ratio) + 'px';

          // to get the visual width/height of the key
          // for better proximity info
          var visualKey = key.querySelector('.visual-wrapper');

          // row layout width is not 100%, make the first and last one bigger
          if (rowLayoutWidth !== layoutWidth &&
              (k === 0 || k === keys.length - 1)) {

            // keep visual key width
            visualKey.style.width = visualKey.offsetWidth + 'px';

            // calculate new tap area
            var newRatio = ratio + ((layoutWidth - rowLayoutWidth) / 2);
            key.style.width = Math.floor(placeHolderWidth * newRatio) + 'px';
            key.classList.add('float-key-' + (k === 0 ? 'first' : 'last'));
          }
        }

        // Now that key sizes have been set and adjusted for the row,
        // loop again and record the size and position of each. If we
        // do this as part of the loop above, we get bad position data.
        for (k = 0; key = keys[k]; k += 1) {
          visualKey = key.querySelector('.visual-wrapper');
          _keyArray.push({
            code: key.dataset.keycode | 0,
            x: visualKey.offsetLeft,
            y: visualKey.offsetTop,
            width: visualKey.clientWidth,
            height: visualKey.clientHeight
          });
        }
      }

      candidateUnitWidth =
        Math.floor(keyboard.clientWidth / numberOfCandidatesPerRow);

      [].forEach.call(
        keyboard.querySelectorAll('.candidate-row span'),
        function(item) {
          var unit = (item.textContent.length >> 1) + 1;
          item.style.width = (unit * candidateUnitWidth - 2) + 'px';
        }
      );

      resizeCandidatePanelToggleButton();
    }
  };

  //
  // Private Methods
  //

  //*
  // Method that generates the HTML markup for each key
  // @label: String inside the key
  // @className: String representing a className to be added to the key
  // @width: Int to be applied as moz-box-flex
  // @dataset: Array of Hash with every { 'key': KEY, 'value': VALUE}
  // to be applied as dataset
  //*

  var pendingSymbolPanelCode = function() {
    var pendingSymbolPanel = document.createElement('div');
    pendingSymbolPanel.id = 'keyboard-pending-symbol-panel';
    return pendingSymbolPanel;
  };

  var candidatePanelCode = function() {
    var candidatePanel = document.createElement('div');
    candidatePanel.id = 'keyboard-candidate-panel';
    if (inputMethodName)
      candidatePanel.classList.add(inputMethodName);
    return candidatePanel;
  };

  var candidatePanelToggleButtonCode = function() {
    var toggleButton = document.createElement('span');
    toggleButton.id = 'keyboard-candidate-panel-toggle-button';
    toggleButton.dataset.keycode = -4;
    if (inputMethodName) {
      toggleButton.classList.add(inputMethodName);
    }

    var toggleButtonImage = document.createElement('span');
    toggleButtonImage.id = 'keyboard-candidate-panel-toggle-button-image';
    toggleButton.appendChild(toggleButtonImage);

    toggleButton.style.width =
      Math.floor(document.getElementById('keyboard').clientWidth /
                 numberOfCandidatesPerRow) + 'px';

    return toggleButton;
  };

  var buildKey = function buildKey(label, className, width, dataset, altNote) {
    var altNoteNode;
    if (altNote) {
      altNoteNode = document.createElement('div');
      altNoteNode.className = 'alt-note';
      altNoteNode.textContent = altNote;
    }

    var contentNode = document.createElement('button');
    contentNode.className = 'keyboard-key ' + className;
    contentNode.setAttribute('style', 'width: ' + width + ';');
    dataset.forEach(function(data) {
      contentNode.dataset[data.key] = data.value;
    });

    var vWrapperNode = document.createElement('span');
    vWrapperNode.className = 'visual-wrapper';

    var labelNode = document.createElement('span');
    // Using innerHTML here because some labels (so far only the &nbsp; in the
    // space key) can be HTML entities.
    labelNode.innerHTML = label;

    vWrapperNode.appendChild(labelNode);
    if (altNoteNode) {
      vWrapperNode.appendChild(altNoteNode);
    }
    contentNode.appendChild(vWrapperNode);

    return contentNode;
  };

  var getWidth = function getWidth() {
    if (!this.ime)
      return 0;

    return this.ime.clientWidth;
  };

  var getHeight = function getHeight() {
    if (!this.ime)
      return 0;

    return this.ime.clientHeight;
  };

  var getKeyArray = function getKeyArray() {
    return _keyArray;
  };

  var getKeyWidth = function getKeyWidth() {
    if (!this.ime)
      return 0;

    return Math.ceil(this.ime.clientWidth / layoutWidth);
  };

  var getKeyHeight = function getKeyHeight() {
    if (!this.ime)
      return 0;

    this.ime.clientHeight;
    var rows = document.querySelectorAll('.keyboard-row');
    var rowCount = rows.length || 3;
    return Math.ceil(this.ime.clientHeight / rowCount);
  };

  // Exposing pattern
  return {
    'init': init,
    'setInputMethodName': setInputMethodName,
    'draw': draw,
    'ime': ime,
    'hideIME': hideIME,
    'showIME': showIME,
    'highlightKey': highlightKey,
    'unHighlightKey': unHighlightKey,
    'showAlternativesCharMenu': showAlternativesCharMenu,
    'showKeyboardAlternatives': showKeyboardAlternatives,
    'hideAlternativesCharMenu': hideAlternativesCharMenu,
    'setUpperCaseLock': setUpperCaseLock,
    'resizeUI': resizeUI,
    'showCandidates': showCandidates,
    'showPendingSymbols': showPendingSymbols,
    'getWidth': getWidth,
    'getHeight': getHeight,
    'getKeyArray': getKeyArray,
    'getKeyWidth': getKeyWidth,
    'getKeyHeight': getKeyHeight,
    'showMoreCandidates': showMoreCandidates,
    'toggleCandidatePanel': toggleCandidatePanel,
    'isFullCandidataPanelShown': isFullCandidataPanelShown,
    'getNumberOfCandidatesPerRow': getNumberOfCandidatesPerRow
  };
})();
