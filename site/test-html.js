const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const dirty = '<button class="fd-apply-btn" data-fd="foo" data-bid="123">✓ Apply</button>';
const clean = DOMPurify.sanitize(dirty, { ADD_ATTR: ['data-fd', 'data-bid'] });

console.log('Sanitized HTML:', clean);
