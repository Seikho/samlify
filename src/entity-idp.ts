/**
* @file entity-idp.ts
* @author tngan
* @desc  Declares the actions taken by identity provider
*/
import Entity, { ESamlHttpRequest } from './entity';
import libsaml from './libsaml';
import utility from './utility';
import { wording, namespace, tags } from './urn';
import redirectBinding from './binding-redirect';
import postBinding from './binding-post';
import { isString } from 'lodash';
import * as xml from 'xml';

const bindDict = wording.binding;
const xmlTag = tags.xmlTag;
const metaWord = wording.metadata;


/*
 * @desc interface function
 */
export default function(props) {
  return new IdentityProvider(props);
}

export class IdentityProvider extends Entity {
  // local variables
  // idpSetting is an object with properties as follow:
  // -------------------------------------------------
  // {string}       requestSignatureAlgorithm     signature algorithm
  // {string}       loginResponseTemplate         template of login response
  // {string}       logoutRequestTemplate         template of logout request
  // {function}     generateID is the customized function used for generating request ID
  //
  // if no metadata is provided, idpSetting includes
  // {string}       entityID
  // {string}       privateKey
  // {string}       privateKeyPass
  // {string}       signingCert
  // {string}       encryptCert (todo)
  // {[string]}     nameIDFormat
  // {[object]}     singleSignOnService
  // {[object]}     singleLogoutService
  // {boolean}      wantLogoutRequestSigned
  // {boolean}      wantAuthnRequestsSigned
  // {boolean}      wantLogoutResponseSigned
  // {object}       tagPrefix
  //
  /**
  * @desc  Identity prvider can be configured using either metadata importing or idpSetting
  * @param  {object} idpSetting
  * @param  {string} meta
  */
  constructor(idpSetting) {
    const defaultIdpEntitySetting = {
      wantAuthnRequestsSigned: false,
      tagPrefix: {
        encryptedAssertion: 'saml',
      },
    };
    const entitySetting = Object.assign(defaultIdpEntitySetting, idpSetting);
    // build attribute part
    if (idpSetting.loginResponseTemplate) {
      if (isString(idpSetting.loginResponseTemplate.context) && Array.isArray(idpSetting.loginResponseTemplate.attributes)) {
        const replacement = {
          AttributeStatement: libsaml.attributeStatementBuilder(idpSetting.loginResponseTemplate.attributes),
        };
        entitySetting.loginResponseTemplate = {
          ...entitySetting.loginResponseTemplate,
          context: libsaml.replaceTagsByValue(entitySetting.loginResponseTemplate.context, replacement),
        };
      } else {
        console.warn('Invalid login response template');
      }
    }
    super(entitySetting, 'idp');
  }

  /**
  * @desc  Generates the login response for developers to design their own method
  * @param  {ServiceProvider}   sp               object of service provider
  * @param  {object}   requestInfo               corresponding request, used to obtain the id
  * @param  {string}   binding                   protocol binding
  * @param  {object}   user                      current logged user (e.g. req.user)
  * @param  {function} customTagReplacement      used when developers have their own login response template
  * @param  {boolean}  encryptThenSign           whether or not to encrypt then sign first (if signing)
  */
  public async createLoginResponse(sp, requestInfo, binding, user, customTagReplacement?, encryptThenSign?) {
    const protocol = namespace.binding[binding] || namespace.binding.redirect;
    if (protocol === namespace.binding.post) {
      const context = await postBinding.base64LoginResponse(requestInfo, {
        idp: this,
        sp,
      }, user, customTagReplacement, encryptThenSign);
      // xmlenc is using async process
      return {
        ...context,
        entityEndpoint: sp.entityMeta.getAssertionConsumerService(binding),
        type: 'SAMLResponse',
      };

    } else {
      // Will support artifact in the next release
      throw new Error('this binding is not supported');
    }
  }

  /**
  * @desc   Validation of the parsed URL parameters
  * @param  {ServiceProvider}   sp               object of service provider
  * @param  {string}   binding                   protocol binding
  * @param  {request}   req                      request
  */
  public parseLoginRequest(sp, binding, req: ESamlHttpRequest) {
    return this.genericParser({
      parserFormat: ['AuthnContextClassRef', 'Issuer', {
        localName: 'Signature',
        extractEntireBody: true,
      }, {
        localName: 'AuthnRequest',
        attributes: ['ID'],
      }, {
        localName: 'NameIDPolicy',
        attributes: ['Format', 'AllowCreate'],
      }],
      from: sp,
      checkSignature: this.entityMeta.isWantAuthnRequestsSigned(),
      parserType: 'SAMLRequest',
      type: 'login',
    }, binding, req);
  }
}
