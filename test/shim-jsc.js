/* Ambiente minimo per eseguire le prove con JavaScriptCore del Mac (senza Node): console, assert, require dei moduli. */
var console = { log: function () { print(Array.prototype.join.call(arguments, " ")); } };
var __assert = function (c, m) { if (!c) throw new Error("assert: " + (m || "")); };
__assert.ok = __assert; __assert.equal = function (a, b, m) { if (a != b) throw new Error("equal " + a + " != " + b + " " + (m || "")); };
__assert.deepEqual = function (a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("deepEqual " + JSON.stringify(a) + " vs " + JSON.stringify(b)); };
__assert.strictEqual = function (a, b) { if (a !== b) throw new Error("strictEqual " + a + " !== " + b); };
var module = { exports: {} }; var self = this;
var __mod={}; var require=function(p){return p==="assert"?__assert:__mod[p];};
__assert.throws = function (f) { try { f(); } catch (e) { return; } throw new Error("throws: nessun errore"); };
var TextEncoder = function () {}; TextEncoder.prototype.encode = function (s) { s = unescape(encodeURIComponent(s)); var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
