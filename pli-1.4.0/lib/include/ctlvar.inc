 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I CONTROLLED Variable.                    */
 /*      Version:       1.0                                          */
 /*      Date:          Jun, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the layout of a CONTROLLED var.    */
 /*                                                                  */
 /*      Where held:    CONTROLLED - static data segment.            */
 /*                     CTL EXTERN - external segment.               */
 /*                                                                  */
 /*      Dependencies:  Mapped in compiled code.                     */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 CTLVAR              aligned based,
         5 CV_id             fixed bin(31),      /* ID             00*/
         5 CV_pDesc          ptr,                /* addr(dft desc) 04*/
         5 CV_DescLen        fixed bin(31),      /* desc length    08*/
         5 fil               char(4),            /* (reserved)     0C*/
         5 CV_end            char(0);            /* End of CTL     10*/

