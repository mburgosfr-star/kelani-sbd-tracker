const fs = require('fs');
const path = require('path');
const { checkDependencySecurity } = require('../scripts/check-dependency-security');

const result = (value, status = 0) => ({ status, stdout: JSON.stringify(value) });
const cleanAudit = () => result({ metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} });

describe('dependency security gate', () => {
  test('checks the lockfile including development tools and every alert page', () => {
    const execute = jest.fn().mockReturnValueOnce(cleanAudit()).mockReturnValueOnce({ status: 0, stdout: '0\n0\n' });
    expect(() => checkDependencySecurity({ dependabot: true, execute })).not.toThrow();
    expect(execute.mock.calls[0][1]).toEqual([
      'audit', '--json', '--package-lock-only', '--include=dev', '--include=optional', '--include=peer',
    ]);
    expect(execute.mock.calls[1][1]).toContain('--paginate');
    expect(execute.mock.calls[1][1]).toContain('length');
  });

  test('CI audit works without GitHub credentials', () => {
    const execute = jest.fn().mockReturnValue(cleanAudit());
    checkDependencySecurity({ execute });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('a vulnerable build dependency blocks even if npm exits successfully', () => {
    const execute = jest.fn().mockReturnValue(result({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: { 'source-map-js': { severity: 'high' } } }));
    expect(() => checkDependencySecurity({ dependabot: true, execute })).toThrow('source-map-js');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test.each([
    { status: 1, stdout: 'network unavailable' },
    { error: new Error('timeout'), status: null },
    result({ error: { code: 'EAUDIT' } }, 1),
    result({ metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} }, 1),
  ])('blocks when the npm audit cannot establish safety: %j', response => {
    expect(() => checkDependencySecurity({ execute: () => response })).toThrow();
  });

  test('an alert on a later page blocks preparation', () => {
    const execute = jest.fn().mockReturnValueOnce(cleanAudit()).mockReturnValueOnce({ status: 0, stdout: '0\n1\n' });
    expect(() => checkDependencySecurity({ dependabot: true, execute })).toThrow('1 open Dependabot alert');
  });

  test.each([
    result({ message: 'Forbidden' }, 1),
    { status: 1, stdout: '[]' },
    { status: 0, stdout: '' },
    { status: 0, stdout: 'invalid' },
    { error: new Error('timeout'), status: null },
  ])('blocks when GitHub alerts cannot be verified: %j', response => {
    const execute = jest.fn().mockReturnValueOnce(cleanAudit()).mockReturnValueOnce(response);
    expect(() => checkDependencySecurity({ dependabot: true, execute })).toThrow();
  });

  test('the live gate precedes all preparation file writes', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../scripts/prepare-release.js'), 'utf8');
    const gate = source.indexOf('checkDependencySecurity({ dependabot: true })');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(source.indexOf('fs.writeFileSync('));
  });
});
