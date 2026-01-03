 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Runtime Library                         */
 /*                     Stream Request Block (SRB),                  */
 /*                     Stream Buffer Block (SBB),                   */
 /*                     and Stream Parameter List (SPL).             */
 /*      Version:       1.0                                          */
 /*      Date:          Sep, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      These structures are the interface           */
 /*                     between GET/GET STRING or PUT/PUT STRING     */
 /*                     and the GET/PUT executors (GetX,PutX).       */
 /*                                                                  */
 /*                     *** All definitions of these areas    ***    */
 /*                     *** have to be kept in sync.          ***    */
 /*                     *** (see 'Dependencies' below).       ***    */
 /*                                                                  */
 /*      Length:        SRB: 36 bytes ('24'x).                       */
 /*                     SBB: 16 bytes ('10'x).                   0.5e*/
 /*                     SPL: 24 bytes ('18'x).                       */
 /*                                                                  */
 /*      Where held:                                                 */
 /*                SRB: Temporary (stack) storage for the duration   */
 /*                     of an I/O operation. Part of IORB and GPSB.  */
 /*                SBB: Temporary (stack) storage for GET/PUT STRING.*/
 /*                     Part of FCB for GET/PUT FILE.                */
 /*                SPL: Temporary (stack) storage of PUT/PUTS/       */
 /*                     GET/GETS.                                    */
 /*                                                                  */
 /*      Created by:    _pli_Get, _pli_Put, _pli_GetS, _pli_PutS.    */
 /*      Deleted by:    same                                         */
 /*                                                                  */
 /*      Dependencies:  Mapped in compiled code.                     */
 /*                     For version compatibility, add new data      */
 /*                     to end.                                      */
 /*               SRB:  The SRB is the same as 'GPSB_SRB' in the     */
 /*                     GPSB, and 'IOR_SRB' in the IORB.             */
 /*               SBB:  The SBB is the same as 'GPSB_SBB' in the     */
 /*                     GPSB, and 'FCB_SBB' in the FCB.              */
 /*               SPL:  none.                                        */
 /*                                                                  */
 /*                     The IORB and the SRB are identical.          */
 /*                                                                  */
 /*      Modifications:                                              */
 /*        2024-07-04: Add 8-byte fil2 to match IORB, rename    1.3.1*/
 /*                    variable arguments @'24'x-'28'x          1.3.1*/
 /*        2008-04-11: Add SPL_bFlg                              0.5e*/
 /*                                                                  */
 /********************************************************************/

 /*-------------------------*/
 /* Stream Request Block    */
 /*-------------------------*/
 dcl   1 SRB                 based,              /* Stream req. blk00*/
         5 SRB_pDSA          ptr,                /* -> Curr DSA    00*/
         5 fil0              char(4),            /* (reserved)     04*/
         5 SRB_bOpt          bit(32),            /* Option bits    08*/
         /* Bit Values for SRB_bOpt (defined by KEYWORD)             */
         /* (Values are the same as IOR_bOpt)                        */
         /*                         |             G     P            */
         /* Statement ------------->|             E     U            */
         /*                         |             T     T            */
         /*                                                          */
         /* -------------- Data Transmission Statement Options ---   */
         /* '00000001'bx - FILE                   R     R            */
         /* '00001000'bx - LIST                   X     X            */
         /* '00002000'bx - DATA                   X     X            */
         /* '00004000'bx - EDIT                   X     X            */
         /* '00010000'bx - COPY                   R                  */
         /* '00020000'bx - SKIP                   E     E            */
         /* '00040000'bx - PAGE                         X            */
         /* '00080000'bx - LINE                         E            */
         /* --- The following values are NOT from KEYWORD ---        */
         /* '10000000'bx - Put a ';'                            0.9.8*/
         /* '20000000'bx - Last data-list item for this PUT          */
         /* '40000000'bx - SKIP(1) specified                         */
         /* '80000000'bx - First use of this SRB(Reuses STRING bit)  */
         5 SRB_pFmt          ptr,                /* ->Format item  0C*/
         5 SRB_pData         ptr,                /* ->Data         10*/
         5 SRB_pDesc         ptr,                /* ->Data Desc    14*/
         5 SRB_pName         ptr,                /* ->Data Name    18*/
         5 SRB_aFmt          ptr,                /* R format chain 1C*/
         5 SRB_condmask      bit(16),            /* Enabled cond   20*/
         5 fil1              char(2),            /* (alignment)    22*/
         /* Variable arguments                                       */
         5 SRB_P1            ptr,                /*                24*/
         5 SRB_P2            ptr,                /*                28*/
         5 fil2              char(8),            /* unused         2c*/
         5 SRB_end           char(0);            /* End of def.    30*/

 /*-------------------------*/
 /* Stream Buffer Block     */
 /*-------------------------*/
 dcl   1 SBB                 based,              /* Stream buf. blk00*/
         5 SBB_aLine         ptr,                /* addr(line)     00*/
         5 SBB_pLine         ptr,                /* -> Line        04*/
         5 SBB_lnsize        fixed bin(31),      /* Line Length    08*/
         5 SBB_col           fixed bin(31),      /* Col pos-1      0C*/
         5 SBB_end           char(0);            /* End of def.    10*/

 /*-------------------------*/
 /* Stream Parameter List   */
 /* Decl of SPL is not BASED*/
 /*-------------------------*/
 dcl   1 SPL,                          /* Stream Parameter List    00*/
         5 SPL_pSRB          ptr,      /* -> SRB                   00*/
         5 SPL_pSBB          ptr,      /* -> SBB                   04*/
         5 SPL_bFlg          bit(32),  /* -> Flags            0.5e 08*/
         /* '00000001'bx - PRINT                              0.5e   */
         5 SPL_LineEnd       entry( fixed bin(15), fixed bin(15) ),
         /* First parameter is reason for LineEnd:                   */
         /*   0: Line is full                                        */
         /*   1: COLUMN Format-Item                                  */
         /*   2: LINE   Format-Item                                  */
         /*   3: PAGE   Format-Item                                  */
         /*   4: SKIP   Format-Item                                  */
         /* Second parameter is 'n' for SKIP, LINE, or COLUMN.       */
         5 SPL_Count         fixed bin(31), /* COUNT for this op   14*/
         /* 'SPL_Count' is set by GETX/PUTX for each Get or Put.     */
         5 SPL_End           char(0);  /* End of list              18*/
