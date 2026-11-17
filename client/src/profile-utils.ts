export interface ParsedAddressVue3 {
  name?: string;
  phone?: string;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  line1?: string;
}

export interface AddressDraftVue3 {
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  postalCode: string;
  line1: string;
  country: string;
}

export interface ProfileDraftVue3 {
  displayName: string;
  callSign: string;
  bio: string;
  avatarColor: string;
}

export interface PasswordDraftVue3 {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const PROFILE_LIMITS_VUE3 = {
  displayName: 30,
  callSign: 20,
  bio: 200,
  contactName: 30,
  phone: 30,
  province: 50,
  city: 50,
  line1: 100,
  postalCode: 20,
  country: 50,
  passwordMin: 8,
  passwordMax: 200,
  rejectReason: 200,
} as const;

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function unicodeLengthVue3(text: string): number {
  return Array.from(String(text || '')).length;
}

export function parseShippingAddressVue3(source: string): ParsedAddressVue3 | null {
  const original = String(source || '').replace(/\r\n?/g, '\n').replace(/[\t\u3000]+/g, ' ').trim();
  if (!original) return null;
  let rest = original.replace(/[\t ]+/g, ' ');
  const result: ParsedAddressVue3 = {};
  const clean = (value: unknown) =>
    String(value || '').replace(/^[\s,，;；|]+|[\s,，;；|]+$/g, '').replace(/\s+/g, ' ');

  function takeLabel(key: keyof ParsedAddressVue3, labels: string[]) {
    const valuePattern = key === 'line1' ? '([^\\n,，;；|]+)' : '([^\\s\\n,，;；|]+)';
    const re = new RegExp('(^|[\\s,，;；|])(?:' + labels.join('|') + ')\\s*[:：]\\s*' + valuePattern, 'i');
    const match = rest.match(re);
    if (!match) return;
    // A full address must still pass through province/city/district parsing.
    if (key === 'line1') {
      rest = rest.replace(match[0], ' ' + match[2] + ' ');
    } else {
      result[key] = clean(match[2]);
      rest = rest.replace(match[0], ' ');
    }
  }

  takeLabel('name', ['收件人(?:姓名)?', '收货人(?:姓名)?', '联系人(?:姓名)?', '姓名', 'recipient', 'receiver', 'name']);
  takeLabel('phone', ['联系电话', '手机号码?', '手机号', '手机', '电话号码', '电话', 'mobile', 'phone', 'tel']);
  takeLabel('country', ['国家(?:地区)?', 'country']);
  takeLabel('province', ['省(?:份)?', '自治区', 'province']);
  takeLabel('city', ['城市', '市', 'city']);
  takeLabel('district', ['区县', '区/县', 'district', 'county']);
  takeLabel('postalCode', ['邮政编码', '邮编', 'postal\\s*code', 'zip']);
  takeLabel('line1', ['详细地址', '街道地址', '地址', 'address']);
  rest = rest.replace(/(^|[\s,，;；|])(?:所在地区|所属地区|所在区域|地区)\s*[:：]\s*/g, ' ');

  const phoneMatch = rest.match(/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/);
  if (!result.phone && phoneMatch) result.phone = phoneMatch[0].replace(/\D/g, '').replace(/^86(?=1\d{10}$)/, '');
  let implicitName = '';
  if (!result.name && phoneMatch && typeof phoneMatch.index === 'number') {
    const prefix = clean(rest.slice(0, phoneMatch.index)).replace(/^(?:收件人|收货人|联系人|姓名)\s*[:：]?\s*/, '');
    if (prefix && prefix.length <= 30 && !/(省|自治区|自治州|地区|市|盟|区|县|路|街|道|号)/.test(prefix)) {
      result.name = prefix;
      implicitName = prefix;
    }
  }
  if (phoneMatch) rest = rest.replace(phoneMatch[0], ' ');
  if (implicitName) rest = rest.replace(implicitName, ' ');

  const zipMatch = rest.match(/(?<!\d)\d{6}(?!\d)/);
  if (!result.postalCode && zipMatch) result.postalCode = zipMatch[0];
  if (zipMatch) rest = rest.replace(zipMatch[0], ' ');

  if (!result.name) {
    const candidate = original
      .split(/\n/)
      .map(clean)
      .find(line => line && !/1[3-9]\d{9}/.test(line) && !/(省|自治区|自治州|地区|市|盟|区|县|路|街|道|号|邮编|地址)/.test(line));
    if (candidate && candidate.length <= 30) {
      result.name = candidate.replace(/^(?:收件人|收货人|姓名)\s*[:：]?\s*/, '').trim();
      if (result.name) rest = rest.replace(result.name, ' ');
    }
  }

  const provinces = [
    '内蒙古自治区', '黑龙江省', '新疆维吾尔自治区', '广西壮族自治区', '宁夏回族自治区', '西藏自治区',
    '香港特别行政区', '澳门特别行政区', '北京市', '天津市', '上海市', '重庆市', '河北省', '山西省',
    '辽宁省', '吉林省', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省', '湖北省',
    '湖南省', '广东省', '海南省', '四川省', '贵州省', '云南省', '陕西省', '甘肃省', '青海省', '台湾省',
  ];
  let region = clean(rest);
  if (!result.province) {
    const province = provinces.find(item => region.includes(item));
    if (province) {
      result.province = province;
      region = clean(region.replace(province, ' '));
    }
  }
  if (!result.city && result.province && ['北京市', '天津市', '上海市', '重庆市'].includes(result.province)) {
    result.city = result.province;
  }
  if (!result.country && /(香港特别行政区|澳门特别行政区|台湾省)/.test(original)) {
    result.country = '中国';
  }

  const cityMatch = !result.city && region.match(/^([^\s,，;；|]{1,20}?(?:自治州|地区|市|盟))/);
  if (cityMatch) result.city = cityMatch[1];
  if (result.city && region.startsWith(result.city)) region = clean(region.slice(result.city.length));

  const districtMatch = !result.district && region.match(/^([^\s,，;；|]{1,20}?(?:新区|区|县|旗))/);
  if (districtMatch) result.district = districtMatch[1];
  if (result.district && region.startsWith(result.district)) region = clean(region.slice(result.district.length));

  const hasStreetMarker = /(路|街|道|号|栋|幢|楼|室|弄|巷|村|镇|乡|组|单元|大厦|园区)/.test(region);
  if (!result.line1 && region && (hasStreetMarker || result.name || result.phone || result.province || result.city || result.district || result.postalCode)) {
    result.line1 = region;
  }
  if (!result.country && Object.keys(result).some(key => key !== 'country')) {
    result.country = '中国';
  }
  (Object.keys(result) as Array<keyof ParsedAddressVue3>).forEach(key => {
    const cleaned = clean(result[key]);
    if (cleaned) result[key] = cleaned;
    else delete result[key];
  });
  return Object.keys(result).length ? result : null;
}

export function addressCityVue3(city: string, district: string): string {
  const normalize = (value: string) => String(value || '').replace(/\s+/g, '');
  const trimmedCity = String(city || '').trim();
  const trimmedDistrict = String(district || '').trim();
  if (!trimmedDistrict || normalize(trimmedCity).endsWith(normalize(trimmedDistrict))) return trimmedCity;
  return [trimmedCity, trimmedDistrict].filter(Boolean).join(' ');
}

export function applyParsedAddressVue3(draft: AddressDraftVue3, parsed: ParsedAddressVue3): number {
  let filled = 0;
  const currentCity = draft.city.trim();
  const keys: Array<keyof AddressDraftVue3> = ['name', 'phone', 'province', 'city', 'district', 'postalCode', 'line1', 'country'];
  for (const key of keys) {
    const nextVal = parsed[key];
    if (!nextVal) continue;
    // Saved city values may already include the district from an earlier visit.
    if (key === 'district' && addressCityVue3(currentCity, nextVal) === currentCity) continue;
    if (!draft[key].trim()) {
      draft[key] = nextVal;
      filled++;
    }
  }
  return filled;
}

export function validateProfileDraftVue3(
  draft: ProfileDraftVue3,
  _allowedColors: string[],
  t: (source: string) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const displayName = draft.displayName.trim();
  const callSign = draft.callSign.trim().toUpperCase();
  const bio = draft.bio.trim();
  const color = draft.avatarColor.trim().toLowerCase();

  if (!displayName) {
    errors.displayName = t('请填写昵称');
  } else if (unicodeLengthVue3(displayName) > PROFILE_LIMITS_VUE3.displayName) {
    errors.displayName = t('昵称不能超过 30 个字符');
  }
  if (unicodeLengthVue3(callSign) > PROFILE_LIMITS_VUE3.callSign) {
    errors.callSign = t('呼号不能超过 20 个字符');
  }
  if (unicodeLengthVue3(bio) > PROFILE_LIMITS_VUE3.bio) {
    errors.bio = t('个人简介不能超过 200 个字符');
  }
  // Swatches are quick presets only; server accepts any valid #RRGGBB color.
  if (!COLOR_RE.test(color)) {
    errors.avatarColor = t('头像颜色需为 #RRGGBB 格式');
  }
  return errors;
}

export function validateAddressDraftVue3(
  draft: AddressDraftVue3,
  t: (source: string) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const province = draft.province.trim();
  const city = addressCityVue3(draft.city, draft.district);
  const line1 = draft.line1.trim();
  const postalCode = draft.postalCode.trim();
  const country = draft.country.trim() || '中国';

  if (!name) {
    errors.name = t('请填写收件人姓名');
  } else if (unicodeLengthVue3(name) > PROFILE_LIMITS_VUE3.contactName) {
    errors.name = t('姓名不能超过 30 个字符');
  }
  if (unicodeLengthVue3(phone) > PROFILE_LIMITS_VUE3.phone) {
    errors.phone = t('联系电话不能超过 30 个字符');
  }
  if (unicodeLengthVue3(province) > PROFILE_LIMITS_VUE3.province) {
    errors.province = t('省份不能超过 50 个字符');
  }
  if (!city) {
    errors.city = t('请填写城市');
  } else if (unicodeLengthVue3(city) > PROFILE_LIMITS_VUE3.city) {
    errors.city = t('城市不能超过 50 个字符');
  }
  if (!line1) {
    errors.line1 = t('请填写详细地址');
  } else if (unicodeLengthVue3(line1) > PROFILE_LIMITS_VUE3.line1) {
    errors.line1 = t('详细地址不能超过 100 个字符');
  }
  if (unicodeLengthVue3(postalCode) > PROFILE_LIMITS_VUE3.postalCode) {
    errors.postalCode = t('邮编不能超过 20 个字符');
  }
  if (unicodeLengthVue3(country) > PROFILE_LIMITS_VUE3.country) {
    errors.country = t('国家/地区不能超过 50 个字符');
  }
  return errors;
}

export function validatePasswordDraftVue3(
  draft: PasswordDraftVue3,
  t: (source: string) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  // Passwords must never be trimmed.
  if (!draft.currentPassword) {
    errors.currentPassword = t('请输入当前密码');
  }
  if (!draft.newPassword) {
    errors.newPassword = t('请输入新密码');
  } else {
    const len = unicodeLengthVue3(draft.newPassword);
    if (len < PROFILE_LIMITS_VUE3.passwordMin) {
      errors.newPassword = t('密码至少 8 位');
    } else if (len > PROFILE_LIMITS_VUE3.passwordMax) {
      errors.newPassword = t('密码不能超过 200 位');
    } else if (!/[A-Za-z]/.test(draft.newPassword) || !/[0-9]/.test(draft.newPassword)) {
      errors.newPassword = t('密码需同时包含字母与数字');
    }
  }
  if (draft.confirmPassword !== draft.newPassword) {
    errors.confirmPassword = t('两次输入的新密码不一致');
  }
  return errors;
}

export function mapAccountFieldErrorsVue3(fields: Record<string, string> | null | undefined): Record<string, string> {
  if (!fields) return {};
  const mapped: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
    const short = String(key).split('.').pop() || key;
    const alias = short === 'contactName' ? 'name' : short;
    if (!(alias in mapped)) mapped[alias] = fields[key];
  }
  return mapped;
}
