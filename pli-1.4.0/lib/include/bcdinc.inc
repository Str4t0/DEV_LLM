 /********************************************************************/
 /*                                                                  */
 /*      Module:        Intel BCD Format                             */
 /*      Version:       1.0                                          */
 /*      Date:          Nov, 2000                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the hardware format of BCD data.   */
 /*                                                                  */
 /*      Dependencies:  Intel Architecture.                          */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 BCD                 based,              /* BCD Data Format  */
         5 BCD_dig     (0:17)bit(4),             /* Data digits      */
         5 BCD_sign          bit(1),             /* Sign bit         */
         5 fil1              bit(3),             /* (unused bits)    */
         5 fil2              bit(4),             /* (unused nibble)  */
         5 BCD_end           char(0);            /* End of BCD Data  */

