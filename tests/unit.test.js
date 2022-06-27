const dns           = require('dns');
const { expect }    = require('chai');
const sandbox       = require('sinon').createSandbox();
const PromiseSocket = require('promise-socket').PromiseSocket;

describe('#ping()', () => {

  const strip = str => str.replace(/\n|\r/g, '').trim();

  const resolveMxStub     = sandbox.stub(dns.promises, 'resolveMx');
  const socketConnectStub = sandbox.stub(PromiseSocket.prototype, 'connect');
  const socketDestroyStub = sandbox.stub(PromiseSocket.prototype, 'destroy');
  const socketReadStub    = sandbox.stub(PromiseSocket.prototype, 'read');
  const socketWriteStub   = sandbox.stub(PromiseSocket.prototype, 'write');
  const socketTimeoutStub = sandbox.stub(PromiseSocket.prototype, 'setTimeout');

  const { ping, SmtpPingStatus } = require('../');

  afterEach(() => sandbox.reset());

  it('should fail when resolving MX record', async () => {
    resolveMxStub.throwsException();
    
    const recipient = 'any@email.com';
    const { complete, status, error } = await ping(recipient);

    expect(complete).to.be.true;
    expect(status).to.be.equals(SmtpPingStatus.INVALID);
    expect(error).to.be.not.undefined;
    expect(resolveMxStub.calledOnce).to.be.true;
    expect(resolveMxStub.getCall(0).firstArg).to.be.equals('email.com');
    expect(socketDestroyStub.called).to.be.false;
  });

  it('should fail when trying to connect to mail exchanger', async () => {
    resolveMxStub.callsFake(async() => [{ exchange: 'exchanger-host.com', priority: 1}, { exchange: 'another-host.com', priority: 10}]);
    socketConnectStub.throwsException();

    const recipient = 'any@email.com';
    const { complete, status, error } = await ping(recipient, { port: 26, timeout: 5000 });

    expect(complete).to.be.true;
    expect(status).to.be.equals(SmtpPingStatus.INVALID);
    expect(error).to.be.not.undefined;
    expect(resolveMxStub.calledOnce).to.be.true;
    expect(resolveMxStub.getCall(0).firstArg).to.be.equals('email.com');
    expect(socketTimeoutStub.getCall(0).firstArg).to.be.equals(5000);
    expect(socketConnectStub.calledOnce).to.be.true;
    expect(socketConnectStub.getCall(0).firstArg).to.deep.equal({ host: 'exchanger-host.com', port: 26 });
    expect(socketDestroyStub.calledOnce).to.be.true;
  });

  it('should fail when server is not ready', async () => {
    resolveMxStub.callsFake(async() => [{ exchange: 'exchanger-host.com', priority: 1}]);
    socketConnectStub.callsFake(async() => {});
    socketReadStub.callsFake(async() => '421 Service not available\r\n');

    const recipient = 'any@email.com';
    const { complete, status, error, commandHistory } = await ping(recipient);

    expect(complete).to.be.false;
    expect(status).to.be.equals(SmtpPingStatus.UNKNOWN);
    expect(error).to.be.undefined;
    expect(resolveMxStub.calledOnce).to.be.true;
    expect(socketConnectStub.calledOnce).to.be.true;
    expect(socketReadStub.calledOnce).to.be.true;
    expect(socketDestroyStub.calledOnce).to.be.true;
    expect(commandHistory).to.deep.equal([{ code: 421, command: null, response: '421 Service not available' }])
  });

  it('should fail on HELO command', async () => {
    resolveMxStub.callsFake(async() => [{ exchange: 'exchanger-host.com', priority: 1}]);
    socketConnectStub.callsFake(async() => {});
    socketReadStub.onFirstCall().callsFake(async() => '220 Service ready\r\n')
    socketReadStub.onSecondCall().callsFake(async() => '451 Requested action aborted: local error in processing\r\n');
    socketWriteStub.callsFake(async() => null);

    const recipient = 'any@email.com';
    const { complete, status, error, commandHistory } = await ping(recipient);

    const heloCommand = strip(socketWriteStub.getCall(0).firstArg);

    expect(complete).to.be.false;
    expect(status).to.be.equals(SmtpPingStatus.UNKNOWN);
    expect(error).to.be.undefined;
    expect(resolveMxStub.calledOnce).to.be.true;
    expect(socketConnectStub.calledOnce).to.be.true;
    expect(socketWriteStub.calledOnce).to.be.true;
    expect(socketReadStub.calledTwice).to.be.true;
    expect(socketDestroyStub.calledOnce).to.be.true;
    expect(commandHistory).to.deep.equal([
      { code: 220, command: null, response: '220 Service ready' },
      { code: 451, command: heloCommand, response: '451 Requested action aborted: local error in processing' }
    ]);
  });

  it('should fail on MAIL FROM command', async () => {
    resolveMxStub.callsFake(async() => [{ exchange: 'exchanger-host.com', priority: 1}]);
    socketConnectStub.callsFake(async() => {});
    socketReadStub.onFirstCall().callsFake(async() => '220 Service ready\r\n')
    socketReadStub.onSecondCall().callsFake(async() => '250 OK\r\n');
    socketReadStub.onThirdCall().callsFake(async() => '451 Requested action aborted: local error in processing\r\n');
    socketWriteStub.callsFake(async() => null);

    const recipient = 'any@email.com';
    const { complete, status, error, commandHistory } = await ping(recipient);

    const heloCommand     = strip(socketWriteStub.getCall(0).firstArg);
    const mailFromCommand =  strip(socketWriteStub.getCall(1).firstArg);

    expect(complete).to.be.false;
    expect(status).to.be.equals(SmtpPingStatus.UNKNOWN);
    expect(error).to.be.undefined;
    expect(resolveMxStub.calledOnce).to.be.true;
    expect(socketConnectStub.calledOnce).to.be.true;
    expect(socketWriteStub.calledTwice).to.be.true;
    expect(socketReadStub.calledThrice).to.be.true;
    expect(socketDestroyStub.calledOnce).to.be.true;
    expect(commandHistory).to.deep.equal([
      { code: 220, command: null, response: '220 Service ready' },
      { code: 250, command: heloCommand, response: '250 OK' },
      { code: 451, command: mailFromCommand, response: '451 Requested action aborted: local error in processing' }
    ]);
  });

  it('should fail on RCPT TO command', async () => {
    resolveMxStub.callsFake(async() => [{ exchange: 'exchanger-host.com', priority: 1}]);
    socketConnectStub.callsFake(async() => {});
    socketReadStub.onCall(0).callsFake(async() => '220 Service ready\r\n')
    socketReadStub.onCall(1).callsFake(async() => '250 OK\r\n');
    socketReadStub.onCall(2).callsFake(async() => '250 OK\r\n');
    socketReadStub.onCall(3).callsFake(async() => '451 Requested action aborted: local error in processing\r\n');
    socketWriteStub.callsFake(async() => null);

    const recipient = 'any@email.com';
    const { complete, status, error, commandHistory } = await ping(recipient);

    const heloCommand     = strip(socketWriteStub.getCall(0).firstArg);
    const mailFromCommand =  strip(socketWriteStub.getCall(1).firstArg);
    const rcptToCommand   =  strip(socketWriteStub.getCall(2).firstArg);

    expect(complete).to.be.true;
    expect(status).to.be.equals(SmtpPingStatus.UNKNOWN);
    expect(error).to.be.undefined;
    expect(resolveMxStub.calledOnce).to.be.true;
    expect(socketConnectStub.calledOnce).to.be.true;
    expect(socketWriteStub.calledThrice).to.be.true;
    expect(socketReadStub.callCount).to.be.equals(4);
    expect(socketDestroyStub.calledOnce).to.be.true;
    expect(commandHistory).to.deep.equal([
      { code: 220, command: null, response: '220 Service ready' },
      { code: 250, command: heloCommand, response: '250 OK' },
      { code: 250, command: mailFromCommand, response: '250 OK' },
      { code: 451, command: rcptToCommand, response: '451 Requested action aborted: local error in processing' }
    ]);
  });

  it('should return INVALID only when smtp response explicitly states mailbox is unavailable', async () => {
    resolveMxStub.callsFake(async() => [{ exchange: 'exchanger-host.com', priority: 1}]);
    socketConnectStub.callsFake(async() => {});
    socketReadStub.onCall(0).callsFake(async() => '220 Service ready\r\n')
    socketReadStub.onCall(1).callsFake(async() => '250 OK\r\n');
    socketReadStub.onCall(2).callsFake(async() => '250 OK\r\n');
    socketReadStub.onCall(3).callsFake(async() => '550 Requested action not taken: mailbox unavailable\r\n');
    socketWriteStub.callsFake(async() => null);

    const recipient = 'any@email.com';
    const { complete, status, error, commandHistory } = await ping(recipient);

    const heloCommand     = strip(socketWriteStub.getCall(0).firstArg);
    const mailFromCommand =  strip(socketWriteStub.getCall(1).firstArg);
    const rcptToCommand   =  strip(socketWriteStub.getCall(2).firstArg);

    expect(complete).to.be.true;
    expect(status).to.be.equals(SmtpPingStatus.INVALID);
    expect(error).to.be.undefined;
    expect(resolveMxStub.calledOnce).to.be.true;
    expect(socketConnectStub.calledOnce).to.be.true;
    expect(socketWriteStub.calledThrice).to.be.true;
    expect(socketReadStub.callCount).to.be.equals(4);
    expect(socketDestroyStub.calledOnce).to.be.true;
    expect(commandHistory).to.deep.equal([
      { code: 220, command: null, response: '220 Service ready' },
      { code: 250, command: heloCommand, response: '250 OK' },
      { code: 250, command: mailFromCommand, response: '250 OK' },
      { code: 550, command: rcptToCommand, response: '550 Requested action not taken: mailbox unavailable' }
    ]);
  });

  it('should return OK only when smtp response explicitly states action is ok', async () => {
    resolveMxStub.callsFake(async() => [{ exchange: 'exchanger-host.com', priority: 1}]);
    socketConnectStub.callsFake(async() => {});
    socketReadStub.onCall(0).callsFake(async() => '220 Service ready\r\n')
    socketReadStub.onCall(1).callsFake(async() => '250 OK\r\n');
    socketReadStub.onCall(2).callsFake(async() => '250 OK\r\n');
    socketReadStub.onCall(3).callsFake(async() => '250 OK\r\n');
    socketWriteStub.callsFake(async() => null);

    const recipient = 'any@email.com';
    const { complete, status, error, commandHistory } = await ping(recipient);

    const heloCommand     = strip(socketWriteStub.getCall(0).firstArg);
    const mailFromCommand =  strip(socketWriteStub.getCall(1).firstArg);
    const rcptToCommand   =  strip(socketWriteStub.getCall(2).firstArg);

    expect(complete).to.be.true;
    expect(status).to.be.equals(SmtpPingStatus.OK);
    expect(error).to.be.undefined;
    expect(resolveMxStub.calledOnce).to.be.true;
    expect(socketConnectStub.calledOnce).to.be.true;
    expect(socketWriteStub.calledThrice).to.be.true;
    expect(socketReadStub.callCount).to.be.equals(4);
    expect(socketDestroyStub.calledOnce).to.be.true;
    expect(commandHistory).to.deep.equal([
      { code: 220, command: null, response: '220 Service ready' },
      { code: 250, command: heloCommand, response: '250 OK' },
      { code: 250, command: mailFromCommand, response: '250 OK' },
      { code: 250, command: rcptToCommand, response: '250 OK' }
    ]);
  });

});