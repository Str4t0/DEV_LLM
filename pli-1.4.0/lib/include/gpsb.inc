 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Get/PUT STRING Block (GPSB)             */
 /*      Version:       1.0                                          */
 /*      Date:          Jun, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the request data passed from       */
 /*                     compiled code to GET or PUT STRING.          */
 /*                                                                  */
 /*      Length:        64 bytes ('40'x).                            */
 /*                                                                  */
 /*      Where held:    Temporary (stack) storage for the duration   */
 /*                     of a GET or PUT STRING.                      */
 /*                                                                  */
 /*      Created by:    GET/PUT STRING statement                     */
 /*      Deleted by:    same                                         */
 /*                                                                  */
 /*      Dependencies:  Mapped in compiled code.                     */
 /*                     For version compatibility, add new data      */
 /*                     to end.                                      */
 /*                     'GPSB_SRB' is the  same as the SRB           */
 /*                         structure and 'IOR_SRB' in the IORB.     */
 /*                     'GPSB_SBB' is the  same as the SBB           */
 /*                         structure and 'FCB_SBB' in the FCB.      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1 GPSB                aligned based,
         5 GPSB_pString      ptr,                /* -> String L/D  00*/
         /* String Request Block (SRB)                               */
         5 GPSB_SRB,         /* Data provided by caller            04*/
           10 GPSB_pDSA      ptr,                /* -> Curr DSA    04*/
           10 fil0           char(4),            /* (reserved)     08*/
           10 GPSB_bOpt      bit(32),            /* Option bits    0C*/
           /* '10000000'bx - Put a ';'                          0.9.8*/
           /* '20000000'bx - Last data-list item for PUT             */
           /* '80000000'bx - (STRING OPTION) used to indicate        */
           /*                first use of this GPSB.                 */
           /*  All values from 'KEYWORD'.                            */
           10 GPSB_pFmt      ptr,                /* -> Format item 10*/
           10 GPSB_pData     ptr,                /* -> Data        14*/
           10 GPSB_pDesc     ptr,                /* -> Data Desc   18*/
           10 GPSB_pName     ptr,                /* -> Data Name   1C*/
           10 GPSB_aFmt      ptr,                /* R format chain 20*/
           10 GPSB_condmask  bit(16),            /* Enabled cond   24*/
           10 fil1           char(2),            /* (alignment)    26*/
           10 SRB_pBDesc     ptr,                /* ->Base descrip 28*/
           10 SRB_DThunk     ptr,                /* iSub thunk ent 2C*/
         /* String Buffer Block (SBB)                                */
         5 GPSB_SBB,         /* Data provided by GET/PUT STRING    30*/
           10 GPSB_aLine     ptr,                /* addr(line)     34*/
           10 GPSB_pLine     ptr,                /* -> Line        38*/
           10 GPSB_lnsize    fixed bin(31),      /* Line length    3C*/
           10 GPSB_col       fixed bin(31),      /* Col pos-1      40*/
           10 fil3           char(4),            /* (unused)       44*/
         5 GPSB_end          char(0);            /* End of IORB    48*/

