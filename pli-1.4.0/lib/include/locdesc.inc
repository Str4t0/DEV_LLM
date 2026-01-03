 /********************************************************************/
 /*                                                                  */
 /*      Module:        Locator/Descriptor Pair                      */
 /*      Version:       1.0                                          */
 /*      Date:          Dec, 2003                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Description of a runtime Locator/Descriptor  */
 /*                     pair.                                        */
 /*                                                                  */
 /*      Dependencies:  Mapped in compiled code.                     */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 LocDesc             based,
         5 pData             ptr,      /* -> Data element            */
         5 pDesc             ptr;      /* -> Descriptor              */

