const { resolveMx }                   = require('dns').promises;
const { PromiseSocket, TimeoutError } = require('promise-socket');

const DEFAULT_SETTINGS = { port: 25, timeout: 3 };
const MAIL_PROVIDERS   = ['gmail.com', 'yahoo.com', 'aol.com', 'outlook.com'];
const SmtpPingStatus   = { OK: 'OK', INVALID: 'INVALID', UNKNOWN: 'UNKNOWN' };
const SmtpStatusCode   = { READY: 220, OK: 250 };

// -- utils --
const after       = (str, char) => str.substring(str.lastIndexOf(char) + 1);
const strip       = str         => str.replace(/\n|\r/g, '').trim();
const randomInt   = (min, max)  => Math.floor(Math.random() * (max - min + 1) + min);
const randomAlpha = size        => Math.random().toString(36).slice(size - 1);
const pickRandom  = items       => items[randomInt(0, items.length - 1)];
const randomEmail = ()          => `${randomAlpha(7)}@${pickRandom(MAIL_PROVIDERS)}`;

// -- dns --
const getHost                      = ({ exchange })      => exchange;
const byLowestPriority             = (previous, current) => previous.priority < current.priority ? previous : current;
const findRecordWithLowestPriority = records             => records.reduce(byLowestPriority);
const findMailExchangerHost        = async fqdn          => getHost(findRecordWithLowestPriority(await resolveMx(fqdn)));

// -- smtp --
const buildSmtpResponse = (command, response) => Object.freeze({
  command:  command  ? strip(command) : command,
  response: response ? strip(response) : response,
  code:     response ? parseInt(response.substring(0, 3)) : response
});

const mapError = error => Object.freeze({
  complete: !(error instanceof TimeoutError),
  status:   error instanceof TimeoutError ? SmtpPingStatus.UNKNOWN : SmtpPingStatus.INVALID,
  error:    error
});

const executePipeline = async(pipeline, args) => {
  if (pipeline.length === 0) return;
  const first = pipeline[0];
  const next  = async() => await executePipeline(pipeline.slice(1), args);
  return await first({ ...args, ...{ next } });
};

const smtpPipeline = [

  async({ socket, commandHistory, next }) => {
    const data = await socket.read();
    const response = buildSmtpResponse(null, data.toString());
    commandHistory.push(response);
    return SmtpStatusCode.READY === response.code
      ? await next()
      : { complete: false, status: SmtpPingStatus.UNKNOWN };
  },

  async({ socket, commandHistory, sender, next }) => {
    const command = `HELO ${after(sender, '@')}\r\n`;
    await socket.write(command);
    const data = await socket.read();
    const response = buildSmtpResponse(command, data.toString());
    commandHistory.push(response);
    return SmtpStatusCode.OK === response.code
      ? await next()
      : { complete: false, status: SmtpPingStatus.UNKNOWN };
  },

  async({ socket, commandHistory, sender, next }) => {
    const command = `MAIL FROM:<${sender}>\r\n`;
    await socket.write(command);
    const data = await socket.read();
    const response = buildSmtpResponse(command, data.toString());
    commandHistory.push(response);
    return SmtpStatusCode.OK === response.code
      ? await next()
      : { complete: false, status: SmtpPingStatus.UNKNOWN };
  },

  async({ socket, commandHistory, recipient }) => {
    const command = `RCPT TO:<${recipient}>\r\n`;
    await socket.write(command);
    const data = await socket.read();
    const response = buildSmtpResponse(command, data.toString());
    commandHistory.push(response);
    return { 
      complete: true, 
      status: SmtpStatusCode.OK === response.code 
        ? SmtpPingStatus.OK 
        : SmtpPingStatus.INVALID 
    };
  }

];

async function ping(recipient, config) {
  const settings       = { ...DEFAULT_SETTINGS, ...config || {} };
  const fqdn           = after(recipient, '@');
  const port           = settings.port;
  const timeout        = settings.timeout;
  const sender         = settings.sender || randomEmail();
  const commandHistory = [];

  let socket, host, complete, status, error;

  try {

    host = await findMailExchangerHost(fqdn);

    socket = new PromiseSocket();
    await socket.connect({ host, port, timeout });
    
    ({ complete, status } = await executePipeline(smtpPipeline, { socket, sender, recipient, commandHistory }));

  } catch (e) {
    ({ complete, status, error } = mapError(e));

  } finally {
    if (socket) socket.destroy();
  }

  return Object.freeze({
    complete,
    status,
    sender,
    recipient,
    host,
    port,
    timeout,
    error,
    commandHistory
  });
}

module.exports = { ping, SmtpPingStatus };