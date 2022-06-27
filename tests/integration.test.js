const { expect }               = require('chai');
const { TimeoutError }         = require('promise-socket');
const { ping, SmtpPingStatus } = require('../');

describe('#ping()', () => {

  const randomAlpha = size => Math.random().toString(36).slice(size - 1);

  it('should fail when resolving MX record', async() => {
    const { complete, status, error } = await ping(`any@invalid-${randomAlpha(7)}-domain.com`);
    expect(complete).to.be.true;
    expect(status).to.be.equals(SmtpPingStatus.INVALID);
    expect(error.code).to.be.not.undefined;
  });

  it('should fail on connection timeout', async() => {
    const { complete, status, error } = await ping('any@gmail.com', { port: 26, timeout: 10 });
    expect(complete).to.be.false;
    expect(status).to.be.equals(SmtpPingStatus.UNKNOWN);
    expect(error).to.be.instanceOf(TimeoutError)
  });

  it('should return status INVALID', async() => {
    const { complete, status, error } = await ping(`any-${randomAlpha(7)}-invalid@gmail.com`);
    expect(complete).to.be.true;
    expect(status).to.be.equals(SmtpPingStatus.INVALID);
    expect(error).to.be.undefined;
  });

  it('should return status OK', async() => {
    const { complete, status, error } = await ping('contact.me@gmail.com');
    expect(complete).to.be.true;
    expect(status).to.be.equals(SmtpPingStatus.OK);
    expect(error).to.be.undefined;
  });

})