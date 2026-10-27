import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../public/js/pages/profile.js', import.meta.url), 'utf8');
const marker = "  QSL.registerPage('profile',";
assert.ok(source.includes(marker));
// Inspect the actual page helpers without adding a production-only test API.
const window = { QSL: { registerPage() {} } };
vm.runInNewContext(source.replace(marker,
  '  window.addressHelpers = { parseShippingAddress, fillParsedAddress, addressCity };\n' + marker), { window });
const { parseShippingAddress: parse, fillParsedAddress: fill, addressCity } = window.addressHelpers;
const plain = value => JSON.parse(JSON.stringify(value));
const expected = {
  name: '张三', phone: '13800138000', province: '广东省', city: '深圳市',
  district: '南山区', line1: '科技南十二路18号', country: '中国',
};

for (const [label, text] of [
  ['spaces', '张三 13800138000 广东省深圳市南山区科技南十二路18号'],
  ['Chinese commas', '张三，13800138000，广东省深圳市南山区科技南十二路18号'],
  ['ASCII commas', '张三,13800138000,广东省深圳市南山区科技南十二路18号'],
  ['newlines', '张三\r\n13800138000\r\n广东省深圳市南山区科技南十二路18号'],
  ['full address label', '收件人：张三\n手机号：13800138000\n地址：广东省深圳市南山区科技南十二路18号'],
  ['region and street labels', '收件人：张三\n手机号：13800138000\n所在地区：广东省 深圳市 南山区\n详细地址：科技南十二路18号'],
  ['individual region labels', '姓名：张三\n电话：13800138000\n省份：广东省\n城市：深圳市\n区县：南山区\n详细地址：科技南十二路18号'],
]) {
  test('shipping address parses ' + label, () => assert.deepEqual(plain(parse(text)), expected));
}

test('shipping address preserves ordinary street names containing label words', () => {
  for (const street of ['省府路18号', '手机城路18号', '城市花园18号']) {
    const parsed = parse('张三 13800138000 湖南省长沙市岳麓区' + street);
    assert.equal(parsed.line1, street);
    assert.equal(parsed.city, '长沙市');
    assert.equal(parsed.district, '岳麓区');
  }
});

test('shipping address handles municipalities and labelled postal codes', () => {
  const parsed = parse('收件人：张三\n手机：13800138000\n地址：北京市朝阳区建国路88号\n邮编：100025');
  assert.equal(parsed.province, '北京市');
  assert.equal(parsed.city, '北京市');
  assert.equal(parsed.district, '朝阳区');
  assert.equal(parsed.line1, '建国路88号');
  assert.equal(parsed.postalCode, '100025');
  assert.equal(parse(''), null);
});

function form(values = {}) {
  const fields = Object.fromEntries(['name', 'phone', 'province', 'city', 'district', 'line1', 'postalCode', 'country']
    .map(key => [key, { value: values[key] || '' }]));
  return { fields, querySelector(selector) { return fields[selector.match(/name="([^"]+)"/)[1]]; } };
}

test('shipping address fills empty fields and preserves occupied fields', () => {
  const target = form({ name: '李四', country: '中国' });
  fill(target, parse('张三，13800138000，广东省深圳市南山区科技南十二路18号'));
  assert.equal(target.fields.name.value, '李四');
  assert.equal(target.fields.phone.value, expected.phone);
  assert.equal(target.fields.district.value, expected.district);
  assert.equal(addressCity(target.fields.city.value, target.fields.district.value), '深圳市 南山区');
});

test('shipping address does not duplicate a district after saving and reopening', () => {
  for (const city of ['深圳市 南山区', '深圳市南山区']) {
    const target = form({ ...expected, city, district: '' });
    assert.equal(fill(target, parse('张三 13800138000 广东省深圳市南山区科技南十二路18号')), 0);
    assert.equal(target.fields.district.value, '');
    assert.equal(addressCity(target.fields.city.value, target.fields.district.value), city);
    // Also protect submit when the district is already present in both fields.
    assert.equal(addressCity(city, '南山区'), city);
  }
});
