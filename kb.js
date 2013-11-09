/*jslint bitwise:true, white:true, plusplus:true, vars:true, browser:true, devel:true, regexp:true */
/*global angular:true, rison:true, $:true */
(function () {
	"use strict";

	// We need this so we can test locally and still save layouts to AWS
	var base_href = "http://www.keyboard-layout-editor.com";

	// Lenient JSON reader/writer
	function toJsonL(obj) {
		var res = [], key;
		if(obj instanceof Array) {
			obj.forEach(function(elem) { res.push(toJsonL(elem));	});
			return '['+res.join(',')+']';
		}		
		if(typeof obj === 'object') {
			for(key in obj) {	if(obj.hasOwnProperty(key)) { res.push(key+':'+toJsonL(obj[key])); } }
			return '{'+res.join(',')+'}';
		}
		return angular.toJson(obj);	
	}
	function toJsonPretty(obj) {
		var res = [];
		obj.forEach(function(elem) { res.push(toJsonL(elem));	});
		return res.join(",\n")+"\n";
	}	
	function fromJsonL(json) { return jsonl.parse(json); }
	function fromJsonPretty(json) { return fromJsonL('['+json+']'); }

	// Darken a color by 20%
	function darkenColor(color) {
		var num = parseInt(color.slice(1), 16),
			R = ((num >> 16) & 0xff) * 0.8,
			G = ((num >> 8) & 0xff) * 0.8,
			B = (num & 0xFF) * 0.8;
		return "#" + (0x1000000 + (((R & 0xff) << 16) + ((G & 0xff) << 8) + (B & 0xff))).toString(16).slice(1);
	}
	
	// Convert RGB values to a CSS-color string
	function rgb(r, g, b) {
		r = r.toString(16); while(r.length<2) { r = "0"+r; }
		g = g.toString(16); while(g.length<2) { g = "0"+g; }
		b = b.toString(16); while(b.length<2) { b = "0"+b; }
		return "#"+r+g+b;
	}
	
	// Simple String.format() implementation
	if(!String.prototype.format) {
		String.prototype.format = function() {
			var args = arguments;
			return this.replace(/\{(\d+)\}/g, function(match, number) { 
				return typeof args[number] !== 'undefined' ? args[number] : match;
			});
		};
	}
	if(!String.prototype.trimStart) {
		String.prototype.trimStart = function() { return this.replace(/^\s\s*/, ''); };
	}
	if(!String.prototype.trimEnd) {
		String.prototype.trimEnd = function() { return this.replace(/\s\s*$/, ''); };
	}
	if(!String.prototype.trim) {
		String.prototype.trim = function() { this.trimStart().trimEnd(); };
	}

	if(!Array.prototype.last) {
		Array.prototype.last = function() {
			return this[this.length-1];
		}
	}

	function sortKeys(keys) {
		keys.sort(function(a,b) { return a.y === b.y ? a.x - b.x : a.y - b.y; });
	}
	
	// Convert between our in-memory format & our serialized format
	function serialize(keyboard) {
		var keys = keyboard.keys;
		var rows = [], row = [], xpos = 0, ypos = 0, color = "#eeeeee", text = "#000000", profile = "", ghost = false, align = 4, fontheight = 3, fontheight2 = 3;
		if(keyboard.meta) {
			var meta = angular.copy(keyboard.meta); 
			if(meta.backcolor === '#eeeeee') { delete meta.backcolor; }
			if(!$.isEmptyObject(meta)) {
				rows.push(meta);
			}
		}
		sortKeys(keys);
		keys.forEach(function(key) {
			var props = {}, prop = false;
			var label = key.labels.join("\n").trimEnd();
			if(key.y !== ypos) { rows.push(row); row = []; ypos++; xpos = 0; }
			function serializeProp(nname,val,defval) { if(val !== defval) { props[nname] = val; prop = true; } return val; }
			ypos += serializeProp("y", key.y-ypos, 0);
			xpos += serializeProp("x", key.x-xpos, 0) + key.width;
			color = serializeProp("c", key.color, color);
			text = serializeProp("t", key.text, text);
			ghost = serializeProp("g", key.ghost, ghost);
			profile = serializeProp("p", key.profile, profile);
			align = serializeProp("a", key.align, align);
			if(key.fontheight != fontheight) {
				fontheight = serializeProp("f", key.fontheight, fontheight);
				fontheight2 = serializeProp("f2", key.fontheight2, fontheight);
			} else {
				fontheight2 = serializeProp("f2", key.fontheight2, fontheight2);
			}
			serializeProp("w", key.width, 1);
			serializeProp("h", key.height, 1);
			serializeProp("w2", key.width2, key.width);
			serializeProp("h2", key.height2, key.height);
			serializeProp("x2", key.x2, 0);
			serializeProp("y2", key.y2, 0);
			serializeProp("n", key.nub || false, false);
			serializeProp("l", key.stepped || false, false);
			if(prop) { row.push(props); }
			row.push(label);
		});
		if(row.length>0) { rows.push(row); }
		return rows;
	}

	function deserialize(rows) {
		var xpos = 0, ypos = 0, color = "#eeeeee", text = "#000000", keys = [], width=1, height=1, xpos2=0, ypos2=0, width2=0, height2=0, profile = "", r, k, nub = false, ghost = false, align = 4, fontheight = 3, fontheight2 = 3, stepped = false;
		var meta = { backcolor: "#eeeeee" };
		for(r = 0; r < rows.length; ++r) {
			if(rows[r] instanceof Array) {
				for(k = 0; k < rows[r].length; ++k) {
					var key = rows[r][k];
					if(typeof key === 'string') {
						keys.push({x:xpos, y:ypos, width:width, height:height, profile:profile, color:color, text:text, labels:key.split('\n'), x2:xpos2, y2:ypos2, width2:width2===0?width:width2, height2:height2===0?height:height2, nub:nub, ghost:ghost, align:align, fontheight:fontheight, fontheight2:fontheight2, stepped:stepped});
						xpos += width;
						width = height = 1;
						xpos2 = ypos2 = width2 = height2 = 0;
						nub = stepped = false;
					} else {
						if(key.a != null) { align = key.a; }
						if(key.f) { fontheight = fontheight2 = key.f; }
						if(key.f2) { fontheight2 = key.f2; }
						if(key.p) { profile = key.p; }
						if(key.c) { color = key.c; }
						if(key.t) { text = key.t; }
						if(key.x) { xpos += key.x; }
						if(key.y) { ypos += key.y; }
						if(key.w) { width = key.w; }
						if(key.h) { height = key.h; }
						if(key.x2) { xpos2 = key.x2; }
						if(key.y2) { ypos2 = key.y2; }
						if(key.w2) { width2 = key.w2; }
						if(key.h2) { height2 = key.h2; }
						if(key.n) { nub = key.n; }
						if(key.l) { stepped = key.l; }
						if(key.g != null) { ghost = key.g; }
					}
				}
				ypos++;
			} else if(typeof rows[r] === 'object') {
				$.extend(meta, rows[r]);
			}
			xpos = 0;
		}
		return { meta:meta, keys:keys };
	}
	
	// Some predefined sizes for our caps
	var sizes = { cap: 54, padding: 2, margin: 6, spacing: 1 };
	sizes.capsize = function(size) { return (size*sizes.cap) - (2*sizes.spacing); };
	
	// The angular module for our application
	var kbApp = angular.module('kbApp', ["ngSanitize", "ui.utils"]);

	// The main application controller
	kbApp.controller('kbCtrl', ['$scope','$http','$location','$timeout', '$sce', '$sanitize', function($scope, $http, $location, $timeout, $sce, $sanitize) {
		var serializedTimer = false;

		// The application version
		$scope.version = "0.8";

		// The selected tab; 0 == Properties, 1 == Kbd Properties, 2 == Raw Data
		$scope.selTab = 0;
	
		// An array used to keep track of the selected keys
		$scope.selectedKeys = [];

		// A single key selection; if multiple keys are selected, this is the 
		// most-recently selected one.
		$scope.multi = {};
		$scope.meta = {};

		// The keyboard data
		$scope.keyboard = { keys: [] };
		$scope.keys = function(newKeys) { if(newKeys) { $scope.keyboard.keys = newKeys; } return $scope.keyboard.keys; };

		// Helper function to select/deselect all keys
		$scope.unselectAll = function() {
			$scope.selectedKeys = [];
			$scope.multi = {};
		};
		$scope.selectAll = function(event) {
			if(event) { event.preventDefault(); }
			sortKeys($scope.keys());
			$scope.unselectAll();
			$scope.keys().forEach(function(key) {
				$scope.selectedKeys.push(key);				
			});
			if($scope.keys().length>0) {
				$scope.multi = angular.copy($scope.keys().last());
			}
		};

		function saveLayout(layout) {
			var data = angular.toJson(layout);
			var fn = CryptoJS.MD5(data).toString();

			// First test to see if the file is already available
			$http.get(base_href+"/layouts/"+fn).success(function() {
				$scope.dirty = false;
				$scope.saved = fn;
				$location.path("/layouts/"+fn);
				$location.hash("");
				$scope.saveError = "";
			}).error(function() {
				// Nope... need to upload it
				var fd = new FormData();
				fd.append("key", "layouts/"+fn);
				fd.append("AWSAccessKeyId", "AKIAJSXGG74EMFBC57QQ");
				fd.append("acl", "public-read");
				fd.append("success_action_redirect", base_href);
				fd.append("policy", "eyJleHBpcmF0aW9uIjoiMjAwMTQtMDEtMDFUMDA6MDA6MDBaIiwiY29uZGl0aW9ucyI6W3siYnVja2V0Ijoid3d3LmtleWJvYXJkLWxheW91dC1lZGl0b3IuY29tIn0sWyJzdGFydHMtd2l0aCIsIiRrZXkiLCJsYXlvdXRzLyJdLHsiYWNsIjoicHVibGljLXJlYWQifSx7InN1Y2Nlc3NfYWN0aW9uX3JlZGlyZWN0IjoiaHR0cDovL3d3dy5rZXlib2FyZC1sYXlvdXQtZWRpdG9yLmNvbSJ9LHsiQ29udGVudC1UeXBlIjoiYXBwbGljYXRpb24vanNvbiJ9LFsiY29udGVudC1sZW5ndGgtcmFuZ2UiLDAsODE5Ml1dfQ==");
				fd.append("signature", "WOsX5QV/y9UlOs2kmtduXYEPeEQ=");
				fd.append("Content-Type", "application/json");
				fd.append("file", data);
				$http.post("http://www.keyboard-layout-editor.com.s3.amazonaws.com/", fd, {
					headers: {'Content-Type': undefined },
					transformRequest: angular.identity
				}).success(function() {
					$scope.dirty = false;
					$scope.saved = fn;
					$location.path("/layouts/"+fn);
					$location.hash("");
					$scope.saveError = "";
				}).error(function(data, status) {
					if(status == 0) {
						// We seem to get a 'cancelled' notification even though the POST 
						// is successful, so we have to double-check.
						$http.get(base_href+"/layouts/"+fn).success(function() { 
							$scope.dirty = false; 
							$scope.saved = fn;
							$location.path("/layouts/"+fn);
							$location.hash("");
							$scope.saveError = "";
						}).error(function(data, status) {
							$scope.saved = false;
							$scope.saveError = status.toString() + " - " + data.toString();
						});
					} else {
						$scope.saved = false;
						$scope.saveError = status.toString() + " - " + data.toString();
					}
				});
			});
		}
		$scope.save = function(event) {
			if(event) {
				event.preventDefault();
			}
			if($scope.dirty) {
				saveLayout(serialize($scope.keyboard));
			}
		};
		$scope.canSave = function() {
			return $scope.dirty;
		};

		// Helper function to select a single key
		function selectKey(key,event) { 
			if(key) {
				// If SHIFT is held down, we want to *extend* the selection from the last 
				// selected item to the new one.
				if(event.shiftKey && $scope.selectedKeys.length > 0) {
					// Get the indicies of all the selected keys
					var currentSel = $scope.selectedKeys.map(function(key) { return $scope.keys().indexOf(key); });
					currentSel.sort(function(a,b) { return parseInt(a) - parseInt(b); });
					var cursor = $scope.keys().indexOf(key);					
					var anchor = $scope.keys().indexOf($scope.selectedKeys.last());
					$scope.selectedKeys.pop();
				}

				// If neither CTRL or ALT is held down, clear the existing selection state
				if(!event.ctrlKey && !event.altKey) {
					$scope.unselectAll();
				}

				// SHIFT held down: toggle the selection everything between the anchor & cursor
				if(anchor !== undefined && cursor !== undefined) {					
					if(anchor > cursor) {
						for(var i = anchor; i >= cursor; --i) {
							selectKey($scope.keys()[i],{ctrlKey:true});
						}
					} else {
						for(var i = anchor; i <= cursor; ++i) {
							selectKey($scope.keys()[i],{ctrlKey:true});
						}
					}
					return;
				}

				// Modify the selection
				var ndx = $scope.selectedKeys.indexOf(key);
				if(ndx >= 0) { //deselect
					$scope.selectedKeys.splice(ndx,1);
					if($scope.selectedKeys.length<1) { 
						$scope.multi = {};
					} else {
						$scope.multi = angular.copy($scope.selectedKeys.last());
					}
				} else { //select
					$scope.selectedKeys.push(key);
					$scope.multi = angular.copy(key);
				}
			}
		};

		// The serialized key data
		$scope.serialized = "";

		// Known layouts/presets
		$scope.layouts = {};
		$scope.samples = {};
		$http.get('layouts.json').success(function(data) { 
			$scope.layouts = data.presets;
			$scope.samples = data.samples;
		});

		// The currently selected palette
		$scope.palette = {};

		// The set of known palettes
		$scope.palettes = {};
		$http.get('colors.json').success(function(data) {
			$scope.palettes = data;
			$scope.palettes.forEach(function(palette) {
				palette.colors.forEach(function(color) {
					color.css = rgb(color.r,color.g,color.b);
				});
			});
		});

		// A set of "known special" keys
		$scope.specialKeys = {};
		$http.get('keys.json').success(function(data) {
			$scope.specialKeys = data;
		});
	
		// Helper to calculate the height of the keyboard layout; cached to improve performance.
		$scope.kbHeight = 0;
		$scope.calcKbHeight = function() {
			var bottom = 0;
			$(".keyborder").each(function(i,e) {
				bottom = Math.max(bottom, $(e).offset().top + $(e).outerHeight());
			});
			$scope.kbHeight = bottom - $('#keyboard').position().top - 10;
		};

		// Given a key, generate the HTML needed to render it	
		var noRenderText = [0,2,1,3,0,4,2,3];
		function renderKey(key) {
			var html = "";
			var capwidth = sizes.capsize(key.width), capwidth2 = sizes.capsize(key.width2);
			var capheight = sizes.capsize(key.height), capheight2 = sizes.capsize(key.height2);
			var capx = sizes.capsize(key.x) + sizes.margin, capx2 = sizes.capsize(key.x+key.x2)+sizes.margin;
			var capy = sizes.capsize(key.y) + sizes.margin, capy2 = sizes.capsize(key.y+key.y2)+sizes.margin;
			var jShaped = (capwidth2 !== capwidth) || (capheight2 !== capheight) || (capx2 !== capx) || (capy2 !== capy);
			var darkColor = darkenColor(key.color);
			var innerPadding = (2*sizes.margin) + (2*sizes.padding);
			var borderStyle = "keyborder", bgStyle = "keybg";

			key.centerx = key.align&1 ? true : false;
			key.centery = key.align&2 ? true : false;
			key.centerf = key.align&4 ? true : false;

			if(key.ghost) {
				borderStyle += " ghosted";
				bgStyle += " ghosted";
			} 
			// The border
			html += "<div style='width:{0}px; height:{1}px; left:{2}px; top:{3}px; background-color:{4};' class='{5}'></div>\n"
						.format( capwidth,    capheight,    capx,       capy,      darkColor,             borderStyle );
			if(jShaped) {
				html += "<div style='width:{0}px; height:{1}px; left:{2}px; top:{3}px; background-color:{4};' class='{5}'></div>\n"
							.format( capwidth2,   capheight2,   capx2,      capy2,     darkColor,             borderStyle );
			}
			// The key edges
			html += "<div style='width:{0}px; height:{1}px; left:{2}px; top:{3}px; background-color:{4};' class='{5}'></div>\n"
						.format( capwidth,    capheight,    capx+1,     capy+1,    darkColor,             bgStyle );
			if(jShaped) {
				html += "<div style='width:{0}px; height:{1}px; left:{2}px; top:{3}px; background-color:{4};' class='{5}'></div>\n"
							.format( capwidth2,   capheight2,   capx2+1,    capy2+1,   darkColor,             bgStyle );
			}

			if(!key.ghost) {
				// The top of the cap
				html += "<div class='keyborder inner' style='width:{0}px; height:{1}px; left:{2}px; top:{3}px; background-color:{4}; padding:{5}px;'></div>\n"
						.format( capwidth-innerPadding, capheight-innerPadding, capx+sizes.margin, capy+(sizes.margin/2), key.color, sizes.padding );
				if(jShaped && !key.stepped) {
				 	html += "<div class='keyborder inner' style='width:{0}px; height:{1}px; left:{2}px; top:{3}px; background-color:{4}; padding:{5}px;'></div>\n"
				 			.format( capwidth2-innerPadding, capheight2-innerPadding, capx2+sizes.margin, capy2+(sizes.margin/2), key.color, sizes.padding );
				}

				if(jShaped && !key.stepped) {
				 	html += "<div class='keyfg' style='width:{0}px; height:{1}px; left:{2}px; top:{3}px; background-color:{4}; padding:{5}px;'>\n"
				 			.format( capwidth2-innerPadding, capheight2-innerPadding, capx2+sizes.margin+1, capy2+(sizes.margin/2)+1, key.color, sizes.padding );
				}
				html += "</div><div class='keyfg' style='width:{0}px; height:{1}px; left:{2}px; top:{3}px; background-color:{4}; padding:{5}px;'>\n"
						.format( capwidth-innerPadding, capheight-innerPadding, capx+sizes.margin+1, capy+(sizes.margin/2)+1, key.color, sizes.padding );

				// The key labels			
				html += "<div class='keylabels' style='width:{0}px; height:{1}px;'>".format(capwidth-innerPadding, capheight-innerPadding);
				key.labels.forEach(function(label,i) {
					if(label && label !== "" && !(key.align&noRenderText[i])) {
						var sanitizedLabel = $sanitize(label.replace(/<([^a-zA-Z\/]|$)/,"&lt;$1"));
						console.log(sanitizedLabel);
						html += "<div class='keylabel keylabel{2} centerx-{5} centery-{6} centerf-{7} textsize{8}' style='color:{1};width:{3}px;height:{4}px;'><div style='width:{3}px;max-width:{3}px;height:{4}px;'>{0}</div></div>\n"
									.format(sanitizedLabel, key.text, i+1, capwidth-innerPadding, capheight-innerPadding, 
											key.centerx, key.centery, key.centerf, i>0 ? key.fontheight2 : key.fontheight);
					}
				});
				html += "</div></div>";
			}
	
			key.html = $sce.trustAsHtml(html);
			key.rect = { x:capx, y:capy, w:capwidth, h:capheight };
			key.rect2 = { x:capx2, y:capy2, w:capwidth2, h:capheight2 };
		};
	
		$scope.deserializeAndRender = function(data) {
			$scope.keyboard = deserialize(data);
			$scope.keys().forEach(function(key) {
				renderKey(key);
			});
			$scope.meta = angular.copy($scope.keyboard.meta);
		};
	
		function updateSerialized() {
			//$timeout.cancel(serializedTimer); // this is slow, for some reason
			$scope.deserializeException = "";
			$scope.serialized = toJsonPretty(serialize($scope.keyboard));
		}

		$scope.deserializeAndRender([]);
		if($location.hash()) {
			var loc = $location.hash();
			if(loc[0]=='@') {
				$scope.deserializeAndRender(URLON.parse(encodeURI(loc)));
			} else {
				$scope.deserializeAndRender(fromJsonL(loc));
			}
		} else if($location.path()[0] === '/') {
			$http.get(base_href + $location.path()).success(function(data) {
				$scope.deserializeAndRender(data);
				updateSerialized();
			}).error(function() {
				$scope.loadError = true;				
			});
		} else {
			// Some simple default content... just a numpad
			$scope.deserializeAndRender([["Num Lock","/","*","-"],["7\nHome","8\n↑","9\nPgUp",{h:2},"+"],["4\n←","5","6\n→"],["1\nEnd","2\n↓","3\nPgDn",{h:2},"Enter"],[{w:2},"0\nIns",".\nDel"]]);
		}

		// Undo/redo support
		var undoStack = [];
		var redoStack = [];
		var canCoalesce = false;
		$scope.canUndo = function() { return undoStack.length>0; };
		$scope.canRedo = function() { return redoStack.length>0; };
		$scope.dirty = false;
		$scope.saved = false;
		$scope.saveError = "";
		window.onbeforeunload = function(e) {
			return $scope.dirty ? 'You have made changes to the layout that are not saved.  You can save your layout to the server by clicking the \'Save\' button.  You can also save your layout locally by bookmarking the \'Permalink\' in the application bar.' : null;
		};

		function transaction(type, fn) {
			var trans = undoStack.length>0 ? undoStack.last() : null;
			if(trans === null || !canCoalesce || trans.type !== type) {
				trans = { type:type, original:angular.copy($scope.keyboard), open:true, dirty:$scope.dirty };
				undoStack.push(trans);
				if(undoStack.length>32) {
					undoStack.shift();
				}
			}
			canCoalesce = true;
			try {
				fn();
			} finally {
				if($location.hash()) {
					$location.hash("");
				}
				if($location.path()) {
					$location.path("");
				}
				trans.modified = angular.copy($scope.keyboard);
				trans.open = false;
				redoStack = [];
				if(type !== 'rawdata') { updateSerialized(); }
				$scope.dirty = true;
				$scope.saved = false;
				$scope.saveError = "";
				$scope.loadError = false;
			}
		}

		$scope.undo = function() { 
			if($scope.canUndo()) { 
				var u = undoStack.pop(); 
				$scope.keyboard = angular.copy(u.original);
				updateSerialized();
				$scope.keys().forEach(function(key) {
					renderKey(key);
				});
				redoStack.push(u); 
				$scope.dirty = u.dirty;
				$scope.unselectAll();
				$scope.meta = $scope.keyboard.meta;
			}
		};

		$scope.redo = function() { 
			if($scope.canRedo()) { 
				var u = redoStack.pop(); 
				$scope.keyboard = angular.copy(u.modified);
				updateSerialized(); 
				$scope.keys().forEach(function(key) {
					renderKey(key);
				});
				undoStack.push(u); 
				$scope.dirty = true;
				$scope.unselectAll();
				$scope.meta = $scope.keyboard.meta;
			}
		};

		function validate(key,prop,value) {
			var v = {
				_ : function() { return value; },
				x : function() { return Math.max(0, Math.min(36, value)); },
				y : function() { return Math.max(0, Math.min(36, value)); },
				x2 : function() { return Math.max(-Math.abs(key.width-key.width2), Math.min(Math.abs(key.width-key.width2), value)); },
				y2 : function() { return Math.max(-Math.abs(key.height-key.height2), Math.min(Math.abs(key.height-key.height2), value)); },
				width : function() { return Math.max(0.5, Math.min(12, value)); },
				height : function() { return Math.max(0.5, Math.min(12, value)); },
				width2 : function() { return Math.max(0.5, Math.min(12, value)); },
				height2 : function() { return Math.max(0.5, Math.min(12, value)); },
				fontheight : function() { return Math.max(1, Math.min(9, value)); },
				fontheight2 : function() { return Math.max(1, Math.min(9, value)); },
			};
			return (v[prop] || v._)();
		}

		function update(key,prop,value) {
			var u = {
				_ : function() { key[prop] = value; },
				width : function() { key.width2 = key.width = value; },
				height : function() { key.height2 = key.height = value; },
				centerx : function() { if(value) { key.align = key.align | 1; } else { key.align = key.align & (~1); } },
				centery : function() { if(value) { key.align = key.align | 2; } else { key.align = key.align & (~2); } },
				centerf : function() { if(value) { key.align = key.align | 4; } else { key.align = key.align & (~4); } },
				fontheight : function() { key.fontheight = key.fontheight2 = value; },
			};
			return (u[prop] || u._)();
		}

		$scope.updateMulti = function(prop) {
			if($scope.multi[prop] == null || $scope.selectedKeys.length <= 0) {
				return;
			}
			var valid = validate($scope.multi, prop, $scope.multi[prop]);
			if(valid !== $scope.multi[prop]) {
				return;
			}

			transaction("update", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {				
					update(selectedKey, prop, $scope.multi[prop]);
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
		};

		$scope.validateMulti = function(prop) {
			if($scope.multi[prop] == null) { 
				$scope.multi[prop] = "";
			}
			var valid = validate($scope.multi, prop, $scope.multi[prop]);
			if(valid !== $scope.multi[prop]) {
				$scope.multi[prop] = valid;
				$scope.updateMulti(prop);
			}
		};

		$scope.updateMeta = function(prop) {
			transaction("metadata", function() {
				$scope.keyboard.meta[prop] = $scope.meta[prop];
			});
		}
		$scope.validateMeta = function(prop) {
		}

		$scope.serialized = toJsonPretty(serialize($scope.keyboard));
	
		$scope.clickSwatch = function(color,$event) {
			$event.preventDefault();
			if($scope.selectedKeys.length<1) { 
				return; 
			}
			transaction("color-swatch", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					if($event.ctrlKey || $event.altKey) {
						selectedKey.text = color.css;
					} else {
						selectedKey.color = color.css;
					}
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
		};
	
		$scope.moveKeys = function(x,y,$event) {
			$event.preventDefault();
			if($scope.selectedKeys.length<1) { 
				return; 
			}

			if(x<0 || y<0) {
				var canMoveKeys = true;
				$scope.selectedKeys.forEach(function(selectedKey) {
					if(selectedKey.x + x < 0 || 
					   selectedKey.y + y < 0 || 
					   selectedKey.x + selectedKey.x2 + x < 0 || 
					   selectedKey.y + selectedKey.y2 + y < 0) {
						canMoveKeys = false;
					}
				});
				if(!canMoveKeys) {
					return;
				}
			}

			transaction("move", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					selectedKey.x = Math.max(0,selectedKey.x + x);
					selectedKey.y = Math.max(0,selectedKey.y + y);
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
			if(y !== 0) { $scope.calcKbHeight(); }
		};
	
		$scope.sizeKeys = function(x,y,$event) {
			$event.preventDefault();
			if($scope.selectedKeys.length<1) { 
				return; 
			}
			transaction("size", function() {
				$scope.selectedKeys.forEach(function(selectedKey) {
					selectedKey.width = selectedKey.width2 = Math.max(1,selectedKey.width + x);
					selectedKey.height = selectedKey.height2 = Math.max(1,selectedKey.height + y);
					renderKey(selectedKey);
				});
				$scope.multi = angular.copy($scope.selectedKeys.last());
			});
			if(y!==0) { $scope.calcKbHeight(); }
		};

		$scope.loadPalette = function(p) {
			$scope.palette = p;
		};
		$scope.loadPreset = function(preset) {
			transaction("preset", function() {
				$scope.deserializeAndRender(preset);
			});
			$scope.dirty = false;
		};
		$scope.loadSample = function(sample) {
			$http.get(base_href + sample).success(function(data) {
				$scope.loadPreset(data);
				$location.path(sample);
			}).error(function() {
				$scope.loadError = true;
			});
		};

		$scope.deleteKeys = function() {
			if($scope.selectedKeys<1)
				return;

			transaction('delete', function() {
				// Sort the keys, so we can easily select the next key after deletion
				sortKeys($scope.keys());

				// Get the indicies of all the selected keys
				var toDelete = $scope.selectedKeys.map(function(key) { return $scope.keys().indexOf(key); });
				toDelete.sort(function(a,b) { return parseInt(a) - parseInt(b); });

				// Figure out which key we're going to select after deletion
				var toSelectNdx = toDelete.last()+1;
				var toSelect = $scope.keys()[toSelectNdx];

				// Delete the keys in reverse order so that the indicies remain valid
				for(var i = toDelete.length-1; i >= 0; --i) {
					$scope.keys().splice(toDelete[i],1);
				}

				// Select the next key
				var ndx = $scope.keys().indexOf(toSelect);
				if(ndx < 0) { ndx = toDelete[0]-1; }
				if(ndx < 0) { ndx = 0; }
				toSelect = $scope.keys()[ndx];
				if(toSelect) {
					$scope.selectedKeys = [toSelect];
					$scope.multi = angular.copy(toSelect);
				} else {
					$scope.unselectAll();
				}
			});
			$('#keyboard').focus();
		};

		function whereToAddNewKeys(nextline) {
			var xpos = 0, ypos = -1;
			sortKeys($scope.keys());
			if(!nextline && $scope.selectedKeys.length>0 && $scope.keys().length>0 && $scope.multi.x == $scope.keys().last().x) {
				xpos = $scope.multi.x + $scope.multi.width;
				ypos = $scope.multi.y;
				if(xpos >= 23) { xpos = 0; ypos++; }
			} else {
				$scope.keys().forEach(function(key) { ypos = Math.max(ypos,key.y); });
				ypos++;
			}
			return {x:xpos, y:ypos};
		}

		$scope.addKey = function(proto, nextline) {
			var newKey = null;
			transaction("add", function() {
				var pos = whereToAddNewKeys(nextline);
				var color = $scope.multi.color || "#eeeeee";
				var textColor = $scope.multi.text || "#000000";
				newKey = {width:1, height:1, color:color, text:textColor, labels:[], x:0, y:0, x2:0, y2:0, width2:1, height2:1, profile:"", ghost:false, align:4, fontheight:3, fontheight2:3, nub:false, stepped:false};
				$.extend(newKey, proto);
				newKey.x += pos.x;
				newKey.y += pos.y;
				renderKey(newKey);
				$scope.keys().push(newKey);
			});
			selectKey(newKey,{});
			$scope.calcKbHeight();
			$('#keyboard').focus();
		};

		$scope.addKeys = function(count) {
			var i;
			for(i = 0; i < count; ++i) {
				$scope.addKey();
			}
		};

		$scope.deserializeException = "";
		$scope.updateFromSerialized = function() {
			if(serializedTimer) {
				$timeout.cancel(serializedTimer);
			}
			serializedTimer = $timeout(function() {
				try {
					$scope.deserializeException = "";
					transaction("rawdata", function() {
						$scope.deserializeAndRender(fromJsonPretty($scope.serialized));
					});
					$scope.unselectAll();
				} catch(e) {
					$scope.deserializeException = e.toString();
				}
			}, 1000);
		};

		$scope.selRect = { display:"none" };

		// Called when the mouse is clicked within #keyboard; we use this to initiate a marquee
		// selection action.
		var doingMarqueeSelect = false;
		$scope.selectClick = function(event) {
			var kbElem = $("#keyboard");
			$scope.selRect = { display:"none", x:event.pageX, y:event.pageY, l:event.pageX, t:event.pageY, w:0, h:0 };
			$scope.selRect.kb = { 	left: kbElem.position().left + parseInt(kbElem.css('margin-left'),10),
									top: kbElem.position().top + parseInt(kbElem.css('margin-top'),10),
									width: kbElem.outerWidth(), 
									height:kbElem.outerHeight() 
								};
			doingMarqueeSelect = true;
			event.preventDefault();
		};

		// Called whenever the mouse moves over the document; ideally we'd get mouse-capture on 
		// mouse-down over #keyboard, but it doesn't look like there's a real way to do that in 
		// JS/HTML, so we do our best to simulate it.  Also, there doesn't appear to be any way
		// to recover if the user releases the mouse-button outside of the browser window.
		$scope.selectMove = function(event) {
			if(doingMarqueeSelect) {
				// Restrict the mouse position to the bounds #keyboard
				var pageX = Math.min($scope.selRect.kb.left + $scope.selRect.kb.width, Math.max($scope.selRect.kb.left, event.pageX));
				var pageY = Math.min($scope.selRect.kb.top + $scope.selRect.kb.height, Math.max($scope.selRect.kb.top, event.pageY));

				// Calculate the new marquee rectangle (normalized)
				if(pageX < $scope.selRect.x) {					
					$scope.selRect.l = pageX;
					$scope.selRect.w = $scope.selRect.x - pageX;
				} else {
					$scope.selRect.l = $scope.selRect.x;
					$scope.selRect.w = pageX - $scope.selRect.x;
				}
				if(pageY < $scope.selRect.y) {
					$scope.selRect.t = pageY;
					$scope.selRect.h = $scope.selRect.y - pageY;
				} else {
					$scope.selRect.t = $scope.selRect.y;
					$scope.selRect.h = pageY - $scope.selRect.y;
				}

				// If the mouse has moved more than our threshold, then display the marquee
				if($scope.selRect.w + $scope.selRect.h > 5) {
					$scope.selRect.display = "inherit";
				}
			}
		};

		// Called when the mouse button is released anywhere over the document; see notes above 
		// about mouse-capture.
		$scope.selectRelease = function(event) {
			if(doingMarqueeSelect) {
				sortKeys($scope.keys());
				doingMarqueeSelect = false;

				// Calculate the offset between #keyboard and the mouse-coordinates
				var kbElem = $("#keyboard");
				var kbPos = kbElem.position();
				var offsetx = kbPos.left + parseInt(kbElem.css('padding-left'),10) + parseInt(kbElem.css('margin-left'),10);
				var offsety = kbPos.top + parseInt(kbElem.css('padding-top'),10) + parseInt(kbElem.css('margin-top'),10);

				// Check to see if the marquee was actually displayed
				if($scope.selRect.display !== "none") {
					// Clear the array of selected keys if the CTRL isn't held down.
					if(!event.ctrlKey && !event.altKey) {
						$scope.unselectAll();
					}

					$scope.selRect.display = "none";

					// Adjust the mouse coordinates to client coordinates
					$scope.selRect.l -= offsetx;
					$scope.selRect.t -= offsety;

					// Iterate over all the keys
					$scope.keys().forEach(function(key) {
						// Check to see if the key is *entirely within* the marquee rectangle
						if( key.rect.x >= $scope.selRect.l && key.rect.x+key.rect.w <= $scope.selRect.l+$scope.selRect.w &&
							key.rect.y >= $scope.selRect.t && key.rect.y+key.rect.h <= $scope.selRect.t+$scope.selRect.h &&
							key.rect2.x >= $scope.selRect.l && key.rect2.x+key.rect2.w <= $scope.selRect.l+$scope.selRect.w &&
							key.rect2.y >= $scope.selRect.t && key.rect2.y+key.rect2.h <= $scope.selRect.t+$scope.selRect.h )
						{
							// Key is inside the rectangle; select it (if not already selected).
							if($scope.selectedKeys.indexOf(key) < 0) {
								selectKey(key, {ctrlKey:true});
							}
						}
					});					
				} else {
					// Clear the array of selected keys if the CTRL isn't held down.
					if(!event.ctrlKey && !event.altKey && !event.shiftKey) {
						$scope.unselectAll();
					}

					// The marquee wasn't displayed, so we're doing a single-key selection; 
					// iterate over all the keys.
					$scope.keys().forEach(function(key) {
						// Just check to see if the mouse click is within any key rectangle
						if( (key.rect.x <= event.pageX-offsetx && key.rect.x+key.rect.w >= event.pageX-offsetx &&
							 key.rect.y <= event.pageY-offsety && key.rect.y+key.rect.h >= event.pageY-offsety) ||
							(key.rect2.x <= event.pageX-offsetx && key.rect2.x+key.rect2.w >= event.pageX-offsetx &&
							 key.rect2.y <= event.pageY-offsety && key.rect2.y+key.rect2.h >= event.pageY-offsety) )
						{
							selectKey(key, {ctrlKey:event.ctrlKey, altKey:event.altKey, shiftKey:event.shiftKey});
						}
					});
				}
				canCoalesce = false;

				event.preventDefault();

				// Focus the keyboard, so keystrokes have the desired effect
				$('#keyboard').focus();
			}
		};
	
		$scope.getPermalink = function() {
			var url = $location.absUrl().replace(/#.*$/,"");
			url += "##" + URLON.stringify(serialize($scope.keyboard));
			return url;
		};
	
		// Called on 'j' or 'k' keystrokes; navigates to the next or previous key
		$scope.prevKey = function(event) {
			if($scope.keys().length>0) {
				sortKeys($scope.keys());
				var ndx = ($scope.selectedKeys.length>0) ? Math.max(0,$scope.keys().indexOf($scope.selectedKeys.last())-1) : 0;
				var selndx = $scope.selectedKeys.indexOf($scope.keys()[ndx]);
				if(event.shiftKey && $scope.keys().length>1 && $scope.selectedKeys.length>0 && selndx>=0) {
					$scope.selectedKeys.pop(); //deselect the existing cursor
					$scope.selectedKeys.splice(selndx,1); //make sure the new cursor is at the end of the selection list
				}
				selectKey($scope.keys()[ndx], {ctrlKey:event.shiftKey});
				canCoalesce = false;
			}
		};
		$scope.nextKey = function(event) {
			if($scope.keys().length>0) {
				sortKeys($scope.keys());
				var ndx = ($scope.selectedKeys.length>0) ? Math.min($scope.keys().length-1,$scope.keys().indexOf($scope.selectedKeys.last())+1) : $scope.keys().length-1;
				var selndx = $scope.selectedKeys.indexOf($scope.keys()[ndx]);
				if(event.shiftKey && $scope.keys().length>1 && $scope.selectedKeys.length>0 && selndx>=0) {
					$scope.selectedKeys.pop(); //deselect the existing cursor
					$scope.selectedKeys.splice(selndx,1); //make sure the new cursor is at the end of the selection list
				}
				selectKey($scope.keys()[ndx], {ctrlKey:event.shiftKey});
				canCoalesce = false;
			}
		};

		$scope.focusKb = function() { $('#keyboard').focus(); };
		$scope.focusEditor = function() { 
			if($scope.selectedKeys.length > 0) {
				if($scope.selTab !== 0) {
					$scope.selTab = 0; 
					$('#properties').removeClass('hidden');
				}
				$('#labeleditor').focus().select();
			} else {
				if($scope.selTab !== 1) {
					$scope.selTab = 1; 
					$('#kbdproperties').removeClass('hidden');
				}
				$('#kbdcoloreditor').focus().select();
			}
		};

		$scope.showHelp = function(event) {
			if(event.srcElement.nodeName !== "INPUT" && event.srcElement.nodeName !== "TEXTAREA") {
				event.preventDefault();
				$('#helpDialog').modal('show');
			}
		};

		// Clipboard functions
		var clipboard = {};
		$scope.cut = function(event) {
			if(event) {
				event.preventDefault();
			}
			if($scope.selectedKeys.length>0) {
				clipboard = angular.copy($scope.selectedKeys);
				$scope.deleteKeys();
			}
		};
		$scope.copy = function(event) {
			if(event) {
				event.preventDefault();
			}
			if($scope.selectedKeys.length>0) {
				clipboard = angular.copy($scope.selectedKeys);
			}
		};
		$scope.paste = function(event) {
			if(event) {
				event.preventDefault();
			}
			if(clipboard.length<1) {
				return;
			}
			sortKeys(clipboard);

			// Copy the clipboard keys, and adjust them all relative to the first key
			var clipCopy = angular.copy(clipboard);
			var minx = 0, miny = 0, singleRow = true;
			clipCopy.forEach(function(key) { 
				minx = Math.min(minx, key.x -= clipboard[0].x);
				miny = Math.min(miny, key.y -= clipboard[0].y);
			});

			// Adjust to make sure nothing < 0
			clipCopy.forEach(function(key) { 
				key.x -= minx;
				key.y -= miny;
				if(key.y>0) { singleRow = false; }
			});

			// Figure out where to put the keys
			var pos = whereToAddNewKeys(!singleRow);

			// Perform the transaction
			transaction("paste", function() {
				clipCopy.forEach(function(key,i) {
					key.x += pos.x;
					key.y += pos.y;
					renderKey(key);
					$scope.keys().push(key);
					$scope.selectedKeys = clipCopy;
					$scope.multi = angular.copy($scope.selectedKeys.last());
				});
			});
		};
		$scope.canCopy = function() { return $scope.selectedKeys.length > 0; }
		$scope.canPaste = function() { return clipboard.length > 0; }
	}]);
	
	// Modernizr-inspired check to see if "color" input fields are supported; 
	// we hide them if they aren't (e.g., on IE), because it's just a duplicate
	// of the existing text version.
	$(document).ready(function() {
		$('.colorpicker').each(function(i,elem) {
			var old = elem.value;
			elem.value = ":)";
			if(elem.value === ":)") {
				elem.style.display = "none";
			}
			elem.value = old;
		});
	});
}());
