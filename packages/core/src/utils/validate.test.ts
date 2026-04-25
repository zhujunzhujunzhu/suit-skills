import { describe, it, expect } from 'vitest';
import {
  validateSkillName,
  parseSkillIdentifier,
} from './validate.js';

describe('validateSkillName', () => {
  it('接受合法的 kebab-case 名称', () => {
    expect(validateSkillName('code-review')).toBe(true);
    expect(validateSkillName('react-helper')).toBe(true);
    expect(validateSkillName('skill123')).toBe(true);
  });

  it('接受单字符名称', () => {
    expect(validateSkillName('a')).toBe(true);
  });

  it('拒绝大写字母和下划线', () => {
    expect(validateSkillName('Code_Review')).toBe(false);
  });

  it('拒绝空字符串', () => {
    expect(validateSkillName('')).toBe(false);
  });

  it('拒绝以连字符开头的名称', () => {
    expect(validateSkillName('-leading')).toBe(false);
  });

  it('拒绝以连字符结尾的名称', () => {
    expect(validateSkillName('trailing-')).toBe(false);
  });
});

describe('parseSkillIdentifier', () => {
  it('解析不带版本号的名称', () => {
    expect(parseSkillIdentifier('code-review')).toEqual({
      name: 'code-review',
      version: undefined,
    });
  });

  it('解析带版本号的名称', () => {
    expect(parseSkillIdentifier('code-review@1.2.0')).toEqual({
      name: 'code-review',
      version: '1.2.0',
    });
  });

  it('解析带预发布版本号的名称', () => {
    expect(parseSkillIdentifier('react-helper@0.1.0-beta')).toEqual({
      name: 'react-helper',
      version: '0.1.0-beta',
    });
  });
});
