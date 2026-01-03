 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Global Data Area (GBL)                  */
 /*      Version:       2.0                                          */
 /*      Date:          Dec, 2003                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      GBL contains data that needs to be shared    */
 /*                     between the .EXE and library routines in     */
 /*                     a DLL.                                       */
 /*                                                                  */
 /*      Length:        96 bytes ('60'x).                            */
 /*                                                                  */
 /*      Where held:    Static Data for _pli_Start.                  */
 /*                                                                  */
 /*      Pointed to by: PGT entry 127.                               */
 /*                                                                  */
 /*      Created by:    The Global Data Area is part of the          */
 /*                     startup stub statically linked with the      */
 /*                     .EXE.  The stub passes the address to the    */
 /*                     startup procedure in the DLL, which stores   */
 /*                     its address in the PGT for future use.       */
 /*                                                                  */
 /*                     After startup, it is always addressed by     */
 /*                     retrieving the address from the PGT.         */
 /*                                                                  */
 /*      Deleted by:    n/a                                          */
 /*                                                                  */
 /*      Dependencies:                                               */
 /*                     Since one of the functions is to hold the    */
 /*                     address of the stream I/O procedures if      */
 /*                     and only if a program uses stream I/O,       */
 /*                     this structure has to be linked with the     */
 /*                     .EXE rather than the PL/I DLL.               */
 /*                                                                  */
 /*                     This structure has an assembler definition   */
 /*                     imbedded in _pli_Start, which actually       */
 /*                     allocates the storage.  These definitions    */
 /*                     must be set in sync.  Since GBL is linked    */
 /*                     with the .EXE, incompatible changes will     */
 /*                     require re-linking all PL/I programs.        */
 /*                                                                  */
 /*                     Since it is part of the .EXE it is sensitive */
 /*                     to version changes.  To maintain some        */
 /*                     compatibility, the length of the structure   */
 /*                     is stored in the first dword.                */
 /*                     Library procedures should use this length    */
 /*                     to check that data is present before         */
 /*                     referencing it.                              */
 /*                                                                  */
 /*                     Two fields 'GBL_User1' and 'GBL_User2'       */
 /*                     are reserved for use by user programs.       */
 /*                     In order to be thread-safe access to these   */
 /*                     should be controlled by a semaphore.         */
 /*                     In order that multiple library packages      */
 /*                     can use these at the same time, I suggest    */
 /*                     that 'GBL_User1' be used as the anchor of    */
 /*                     a chain of storage blocks, each with it's    */
 /*                     forward chain in the first dword and some    */
 /*                     unique identifying information in the        */
 /*                     second dword.  'GBL_User2' can be used to    */
 /*                     hold the handle of the semaphore to          */
 /*                     provide single-threading when updating.      */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*	   2017-08-18 - ISAM entry                             0.9.10*/
 /*	   2010-11-12 - Change 'TDA' to 'TCB'.			0.9.2*/
 /*	   2010-03-02 - add addr(_start) for Linux		 0.8d*/
 /*        2009-08-18 - add addr(sysid string)                   0.8c*/
 /*        2008-05-21 - add gbl_main_ep, gbl_plitabs_addr.       0.5f*/
 /*                     (modifications for RTL in DLL)           0.5f*/
 /*        2004-06-09 - add GBL_TDA_anchor                           */
 /*                                                                  */
 /********************************************************************/

 dcl   1 GBL                 aligned based,
         5 GBL_data_size     fixed bin(31), /* Size of GBL struc'00'x*/
         5 GBL_return_code   fixed bin(31), /* Return code      '04'x*/
         /* -------------------------------------------------------- */
         /* This is the address of _pli_Main                         */
         /* -------------------------------------------------------- */
         5 GBL_MAIN_EP       entry          /* Entry for MAIN   '08'x*/
                             variable,
         /* -------------------------------------------------------- */
         /* If the .EXE uses stream I/O, the addresses of the        */
         /* GET and PUT procedures are stored here.  These           */
         /* procedures pull in all the other FORMAT baggage.         */
         /* If the .EXE doesn't use stream I/O, these will           */
         /* contain the address of an error stub.                    */
         /* This is not too meaningful if using the PL/I DLL,        */
         /* but will save storage if using static linkage.           */
         5 GBL_GET_EP        entry(ptr,ptr) /* Entry for GET    '10'x*/
                             variable,
         5 GBL_PUT_EP        entry(ptr,ptr) /* Entry for PUT    '18'x*/
                             variable,
         5 GBL_ISAM_EP       entry(ptr,ptr) /* Entry for PUT    '20'x*/
                             variable,
         /* ---------- U S E R   F I E L D S ----------------------- */
         /* (these eight bytes may be defined any way required)      */
         5 GBL_User1         ptr,           /* (user field)     '28'x*/
         5 GBL_User2         fixed bin(31), /* (user field)     '2C'x*/
         /* -------------------------------------------------------- */
         5 GBL_TCB_anchor    ptr,           /* ->Major Task TCB '30'x*/
         5 GBL_alloc_cnt     fixed bin(31), /* Ctl Stg alloc cnt'34'x*/
         5 fil2              char(4),       /* unused           '38'x*/
         5 GBL_sysid_addr    ptr,           /* addr(sysid string'3C'x*/
         5 GBL_start_addr    ptr,           /* Weak addr(_start)'40'x*/
         5 fil3              char(28),      /* (future use)     '44'x*/
         5 GBL_end           char(0);       /* End address      '60'x*/

