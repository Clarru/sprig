import {expect,it} from 'vitest';
import {speechUpdate} from './speech-update';
it('sends only additions to the same growing utterance',()=>{
 expect(speechUpdate('I cannot write','I cannot write as fast as I think.')).toEqual({added:'as fast as I think.'});
 expect(speechUpdate('The app transcr','The app transcribes speech.')).toEqual({added:'transcribes speech.'});
 expect(speechUpdate('hello everyone','Hello everyone.')).toEqual({added:''});
});
it('keeps corrections distinct and does not suppress a repeated new utterance',()=>{
 expect(speechUpdate('We use Spring','We use Sprig')).toEqual({added:'',correction:{before:'We use Spring',after:'We use Sprig'}});
 expect(speechUpdate(undefined,'Undo that.')).toEqual({added:'Undo that.'});
 expect(speechUpdate('Require an account','Require an account?').correction).toBeDefined();
});
