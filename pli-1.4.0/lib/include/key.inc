 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Record Key Definition.                  */
 /*      Version:       1.0                                          */
 /*      Date:          Apr, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the structure of a record key.     */
 /*                                                                  */
 /*      Where held:    anywhere.                                    */
 /*                                                                  */
 /*      Dependencies:  OS/2 file API.                               */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 KEY                 aligned based,
         5 KEY_addr          fixed bin(31),      /* Record address   */
         5 fil               fixed bin(31),      /* (2nd wrd of addr)*/
         5 KEY_len           fixed bin(31),      /* Record length    */
         5 KEY_end           char(0);            /* End of KEY       */

