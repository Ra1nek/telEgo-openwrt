const assert = require('node:assert/strict');
const fs = require('node:fs');

function nodeList(items) {
	const list = { length: items.length };
	for (let i = 0; i < items.length; i++)
		list[i] = items[i];
	list[Symbol.iterator] = function* () {
		for (let i = 0; i < this.length; i++)
			yield this[i];
	};
	return list;
}

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag;
		this.attrs = attrs || {};
		this.children = Array.isArray(children) ? children : [children];
		this.classList = {
			toggle: (name, enabled) => {
				const classes = String(this.attrs.class || '').split(/\s+/).filter(Boolean);
				const set = new Set(classes);
				if (enabled) set.add(name); else set.delete(name);
				this.attrs.class = Array.from(set).join(' ');
			}
		};
	}
	setAttribute(name, value) { this.attrs[name] = value; }
	getAttribute(name) { return this.attrs[name]; }
	querySelectorAll(selector) {
		const out = [];
		const match = selector === '.telego-app-tab'
			? String(this.attrs.class || '').split(/\s+/).includes('telego-app-tab')
			: false;
		if (match) out.push(this);
		for (const child of this.children)
			if (child && child.querySelectorAll) out.push(...child.querySelectorAll(selector));
		return nodeList(out);
	}
}

const source = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/app-shell.js', 'utf8');
const L = {
	url: path => '/cgi-bin/luci/' + path,
	resource: path => '/luci-static/resources/' + path,
	// Match LuCI.toArray(): generic objects such as NodeList are wrapped,
	// not expanded. The shell must therefore not use L.toArray(NodeList).
	toArray: value => {
		if (value == null) return [];
		if (Array.isArray(value)) return value;
		if (typeof value === 'object') return [value];
		const text = String(value).trim();
		return text ? text.split(/\s+/) : [];
	}
};
function BaseClass() {}
BaseClass.extend = function (properties) {
	function Constructor() {}
	Object.assign(Constructor.prototype, properties);
	return Constructor;
};

assert.match(source, /'require baseclass';/);
const ShellClass = new Function('E', '_', 'L', 'baseclass', source)(
	(tag, attrs, children) => new Element(tag, attrs, children),
	x => x,
	L,
	BaseClass
);
assert.equal(typeof ShellClass, 'function', 'LuCI module factory must return a class constructor');
const shell = new ShellClass();

let selected = null;
const content = new Element('section', { id: 'content' });
const root = shell.wrap('overview', content, { onSelect: id => { selected = id; } });
const tabs = root.querySelectorAll('.telego-app-tab');

assert.equal(tabs.length, 4);
assert.equal(Array.isArray(tabs), false, 'querySelectorAll test double must behave like a NodeList, not an Array');
assert.deepEqual(Array.from(tabs, tab => tab.children[0]), ['Overview', 'MTProxy', 'WEB Ingress', 'Diagnostics']);
assert.equal(tabs[0].tag, 'button');
assert.equal(tabs[1].tag, 'button');
assert.equal(tabs[2].tag, 'a');
assert.equal(tabs[3].tag, 'a');
assert.equal(tabs[0].attrs['aria-selected'], 'true');
assert.equal(tabs[2].attrs.href, '/cgi-bin/luci/admin/services/telego/ingress');
assert.equal(tabs[3].attrs.href, '/cgi-bin/luci/admin/services/telego/advanced');

tabs[1].attrs.click({ preventDefault() {} });
assert.equal(selected, 'mtproxy');

shell.activate(root, 'mtproxy');
assert.equal(root.attrs['data-telego-section'], 'mtproxy');
assert.equal(tabs[0].attrs['aria-selected'], 'false');
assert.equal(tabs[1].attrs['aria-selected'], 'true');
assert.match(tabs[1].attrs.class, /\bactive\b/);

assert.equal(shell.diagnosticsNav, undefined, 'P5.6 removes the diagnostics secondary navigation');

const menu = JSON.parse(fs.readFileSync('package/luci-app-telego/root/usr/share/luci/menu.d/telego.menu.json', 'utf8'));
assert.equal(menu['admin/services/telego/configuration'].title, 'Overview');
assert.equal(menu['admin/services/telego/ingress'].title, undefined);
assert.equal(menu['admin/services/telego/advanced'].title, undefined);
assert.equal(menu['admin/services/telego/nginx-files'].title, undefined);
assert.equal(menu['admin/services/telego/ingress'].action.path, 'telego/ingress');
assert.equal(menu['admin/services/telego/advanced'].action.path, 'telego/advanced');
assert.equal(menu['admin/services/telego/nginx-files'].action.path, 'telego/nginx-files');

console.log('LuCI P5.1 application shell tests passed');
