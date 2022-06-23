# smtp-ping
Verify an email address through SMTP Ping

"SMTP Ping" is an attempt to connect and exchange information with a mail exchanger server using the SMTP protocol in order to validate the existence of a email box address.

The smtp ping flow consists of a DNS record query(MX) to find the mail exchanger server followed by an attempt to "send"(the email is never sent) an email to a recipient. The process is interrupted at the moment that the server confirms the existence of the recipient.

**Note that pinging an email address does not produce a reliable result.  Many mail exchanger servers implement strict policies when exchanging information with unknown hosts, so false positive results are expected.**

## Installation
```
npm install --save smtp-ping
```

## Usage
```
const { ping, SmtpPingStatus } = require('smtp-ping');

ping('any@email.com')
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

Overriding the default settings:
```
const { ping, SmtpPingStatus } = require('smtp-ping');

const config = { sender: 'sender@email.com', port: 26, timeout: 5000 };
ping('any@email.com', config)
  .then(result => console.log(result))
  .catch(error => console.error(error));
```
The code above will produce the following result:
```
{
  complete:       boolean,
  status:         string,
  sender:         string,
  recipient:      string,
  fqdn:           string,
  host:           string,
  port:           number,
  timeout:        number,
  error:          <Error Object> | undefined,
  commandHistory: [
    { 
      command: string, 
      response: string, 
      code: number
    }
  ]
}
```

| Attribute      | Value                        | Default            | Description                                                 |
| -------------- | ---------------------------- | ------------------ | ----------------------------------------------------------- |
| complete       | true or false                | None               | Indicates if the ping is complete                           | 
| status         | 'OK', 'INVALID' or 'UNKNOWN' | None               | Email box address status                                    | 
| sender         | 'any@email'                  | Randomly Generated | Email address of the sender                                 | 
| recipient      | 'any@email'                  | None               | Email address of the recipient                              |
| fqdn           | 'domain.com'                 | None               | Domain of the recipient's email                             |
| host           | 'domain.com'                 | None               | Mail exchanger server host                                  | 
| port           | 25                           | 25                 | Mail exchanger server port                                  |
| timeout        | 3000                         | 3000               | Socket idle timeout in milliseconds                         | 
| error          | Error object                 | None               | Error object containing the details of the exception        | 
| commandHistory | [{command, response, code}]  | None               | Array of objects containing the SMTP commands and responses |

The ```complete``` attribute will be considered ```false``` whenever the ping flow is interrupted(Idle Timeout, Transmission error, etc).

The ```status``` attribute will be considered ```UNKNOWN``` when the SMTP pipeline(exchanging messages with the server) was not able to be completed(Idle Timeout, Transmission error, Connection closed by the server, etc).

The ```status``` attribute will be ```INVALID``` when the client is unable to find/connect to the mail exchanger host or when the mail exchanger server explicitly informs the email is not valid.


## License

This code is licensed under the [MIT License](./LICENSE.txt).

All files located in the node_modules and external directories are externally maintained libraries used by this software which have their own licenses; we recommend you read them, as their terms may differ from the terms in the MIT License.
