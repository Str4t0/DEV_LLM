 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I ENTRY/LABEL variable                    */
 /*      Version:       1.0                                          */
 /*      Date:          Feb, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes internal format of PL/I ENTRY and  */
 /*                     LABEL variables.                             */
 /*                                                                  */
 /*      Dependencies:  None                                         */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 ent_var             based,
         5 ent_entry_point   ptr,
         5 ent_static_DSA    ptr;

