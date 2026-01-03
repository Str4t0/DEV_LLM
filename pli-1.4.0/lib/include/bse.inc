 /********************************************************************/
 /*           Iron Spring PL/I Runtime Library Version 0.5           */
 /*              Distributed under the Gnu LGPL License              */
 /*                                                                  */
 /*      Module:        BSE                                          */
 /*      Version:       1.0                                          */
 /*      Date:          17 Sep, 2007                                 */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Definitions for OS/2 Control Program         */
 /*                     functions (Dosxxx).                          */
 /*                                                                  */
 /*      Dependencies:  OS/2 Warp 4.                                 */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                   . Include individual groups based on           */
 /*                     setting of preprocessor variables.           */
 /*                   . Change 'ulxxx' data to 'unsigned' when       */
 /*                     implemented.                                 */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 /*-----------------------------------*/
 /* Date and Time                     */
 /*-----------------------------------*/
 dcl     DosGetDateTime      entry(ptr)
                             external( 'DosGetDateTime' )
                             returns( fixed bin(31) ) /* unsigned */
                             options( asm byvalue linkage(system) );
 dcl     DosSetDateTime      entry(ptr)
                             external( 'DosSetDateTime' )
                             returns( fixed bin(31) ) /* unsigned */
                             options( asm byvalue linkage(system) );

 /*-----------------------------------*/
 /* Debugging                         */
 /*-----------------------------------*/
 dcl     DosDebug            entry( ptr )             /* pdbgbuf     */
                             returns( fixed bin(31) /* unsigned */ )
                             external( 'DosDebug' )
                             options( asm byvalue linkage(system) );

 /*-----------------------------------*/
 /* Device Handling                   */
 /*-----------------------------------*/
 /* DosCloseVDD                       */
 /* DosOpenVDD                        */
 /* DosDevConfig                      */
 /* DosRequestVDD                     */
 /* DosDevIOCtl                       */
 /* DosTmrQueryFreq                   */
 /* DosTmrQueryTime                   */

 /*-----------------------------------*/
 /* Dynamic Link Modules              */
 /*-----------------------------------*/
 /* DosFreeModule                     */
 /* DosQueryModuleName                */
 /* DosLoadModule                     */
 /* DosQueryProcAddr                  */
 /* DosQueryModuleHandle              */
 /* DosQueryProcType                  */

 /*-----------------------------------*/
 /* Error Processing                  */
 /*-----------------------------------*/
 /* DosErrClass                       */
 /* DosError                          */

 /*-----------------------------------*/
 /* Exceptions                        */
 /*-----------------------------------*/
 dcl     DosAcknowledgeSignalException
                             entry( fixed bin(31) )
                             external( 'DosAcknowledgeSignalException' )
                             returns( fixed bin(31) ) /* unsigned */
                             options(asm byvalue linkage(system) );

 /*-----------------------------------*/
 /* Extended Attributes               */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* File Locking                      */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* File Management                   */
 /*-----------------------------------*/
 dcl     DosClose            entry( fixed bin(31) )   /* hFile       */
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosOSClose' );
 dcl      DosFindClose       entry( fixed bin(31) )   /* hDir        */
                             returns( fixed bin(31) )
                             options( asm byvalue linkage(system) )
                             ext( 'DosFindClose' );
 dcl      DosFindFirst       entry( ptr,              /* pszFileSpec */
                                    ptr,              /* phDir       */
          /* Values for hDir:                                        */
          /*    HDIR_SYSTEM               0001X                      */
          /*    HDIR_CREATE               -1                         */
                                    fixed bin(31),    /* flAttribute */
          /* Values for flAttribute:                                 */
          /*    MUST_HAVE_ARCHIVED        2000X                      */
          /*    MUST_HAVE_DIRECTORY       1000X                      */
          /*    MUST_HAVE_SYSTEM          0400X                      */
          /*    MUST_HAVE_HIDDEN          0200X                      */
          /*    MUST_HAVE_READONLY        0100X                      */
          /*    FILE_ARCHIVED             0020X                      */
          /*    FILE_DIRECTORY            0010X                      */
          /*    FILE_SYSTEM               0004X                      */
          /*    FILE_HIDDEN               0002X                      */
          /*    FILE_READONLY             0001X                      */
          /*    FILE_NORMAL               0000X                      */
                                    ptr,              /* pfindbuf    */
                                    fixed bin(31),    /* cbBuf       */
                                    ptr,              /* pcFileNames */
                                    fixed bin(31) )   /* ulInfoLevel */
          /* Values for ulInfoLevel:                                 */
          /*    FIL_STANDARD              1                          */
          /*    FIL_QUERYEASIZE           2                          */
          /*    FIL_QUERYEASFROMLIST      3                          */
                             returns( fixed bin(31) )
                             options( asm byvalue linkage(system) )
                             ext( 'DosFindFirst' );
 dcl      DosFindNext        entry( fixed bin(31),    /* hDir        */
                                    ptr,              /* phFindBuf   */
                                    fixed bin(31),    /* cbFindBuf   */
                                    ptr )             /* pcFileNames */
                             returns( fixed bin(31) /* unsigned */ )
                             ext( 'DosFindNext' )
                             options( asm byvalue linkage(system) );

 dcl    1 FILEFINDBUF3       based,    /* FIL_STANDARD               */
          5 NextEntryOffset  fixed bin(31),
          5 fDateCreation    bit(16),
          5 fTimeCreation    bit(16),
          5 fDateLastAccess  bit(16),
          5 fTimeLastAccess  bit(16),
          5 fDateLastWrite   bit(16),
          5 fTimeLastWrite   bit(16),
          5 cbFile           fixed bin(31),
          5 cbFileAlloc      fixed bin(31),
          5 attrFile         fixed bin(31),
          5 cchName          bit(8),
          5 achName          char(256);

 dcl    1 FILEFINDBUF4       based,     /* FIL_QUERYEASIZE           */
          5 NextEntryOffset  fixed bin(31),
          5 fDateCreation    bit(16),
          5 fTimeCreation    bit(16),
          5 fDateLastAccess  bit(16),
          5 fTimeLastAccess  bit(16),
          5 fDateLastWrite   bit(16),
          5 fTimeLastWrite   bit(16),
          5 cbFile           fixed bin(31),
          5 cbFileAlloc      fixed bin(31),
          5 attrFile         fixed bin(31),
          5 cbList           fixed bin(31),
          5 cchName          bit(8),
          5 achName          char(256);

 dcl    1 FDATE              unaligned based,
          5 year             bit(7),
          5 month            bit(4),
          5 day              bit(5);

 dcl    1 FTIME              unaligned based,
          5 hours            bit(5),
          5 minutes          bit(6),
          5 twosecs          bit(5);
 dcl     DosOpen             entry( ptr,              /* pszFileName */
                                    ptr,              /* pHf         */
                                    ptr,              /* pulAction   */
                                    fixed bin(31),    /* cbFile      */
                                    bit(32),          /* ulAttribute */
                                    bit(32),          /* fsOpenFlags */
                                    bit(32),          /* fsOpenMode  */
                                    ptr )             /* peaop2      */
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosOpen' );
 /* Values for 'fsOpenFlags'     */
 dcl OPEN_ACTION_FAIL_IF_EXISTS     bit(32) static init('00000000'bx);
 dcl OPEN_ACTION_OPEN_IF_EXISTS     bit(32) static init('01000000'bx);
 dcl OPEN_ACTION_REPLACE_IF_EXISTS  bit(32) static init('02000000'bx);
 dcl OPEN_ACTION_FAIL_IF_NEW        bit(32) static init('00000000'bx);
 dcl OPEN_ACTION_CREATE_IF_NEW      bit(32) static init('10000000'bx);
 /* Values for 'ulAttribute'     */
 dcl FILE_ARCHIVED                  bit(32) static init('20000000'bx);
 dcl FILE_DIRECTORY                 bit(32) static init('10000000'bx);
 dcl FILE_SYSTEM                    bit(32) static init('04000000'bx);
 dcl FILE_HIDDEN                    bit(32) static init('02000000'bx);
 dcl FILE_READONLY                  bit(32) static init('01000000'bx);
 dcl FILE_NORMAL                    bit(32) static init('00000000'bx);
 /* Values for 'fsOpenMode'      */
 dcl OPEN_ACCESS_READONLY           bit(32) static init('00000000'bx);
 dcl OPEN_ACCESS_WRITEONLY          bit(32) static init('01000000'bx);
 dcl OPEN_ACCESS_READWRITE          bit(32) static init('02000000'bx);
 dcl OPEN_SHARE_DENYREADWRITE       bit(32) static init('10000000'bx);
 dcl OPEN_SHARE_DENYWRITE           bit(32) static init('20000000'bx);
 dcl OPEN_SHARE_DENYREAD            bit(32) static init('30000000'bx);
 dcl OPEN_SHARE_DENYNONE            bit(32) static init('40000000'bx);
 dcl OPEN_FLAGS_NOINHERIT           bit(32) static init('80000000'bx);
 dcl OPEN_FLAGS_NO_LOCALITY         bit(32) static init('00000000'bx);
 dcl OPEN_FLAGS_SEQUENTIAL          bit(32) static init('00010000'bx);
 dcl OPEN_FLAGS_RANDOM              bit(32) static init('00020000'bx);
 dcl OPEN_FLAGS_RANDOMSEQUENTIAL    bit(32) static init('00030000'bx);
 dcl OPEN_FLAGS_NO_CACHE            bit(32) static init('00100000'bx);
 dcl OPEN_FLAGS_FAIL_ON_ERROR       bit(32) static init('00200000'bx);
 dcl OPEN_FLAGS_WRITE_THROUGH       bit(32) static init('00400000'bx);
 dcl OPEN_FLAGS_DASD                bit(32) static init('00800000'bx);
 dcl     DosRead             entry( fixed bin(31),    /* hFile       */
                                    ptr,              /* pBuffer     */
                                    fixed bin(31),    /* cbRead      */
                                    ptr )             /* pcbActual   */
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosRead' );
 dcl     DosSetFilePtr       entry( fixed bin(31),    /* hFile       */
                                    fixed bin(31),    /* ib          */
                                    fixed bin(31),    /* method      */
                                    ptr )             /* addr(ibAct) */
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosSetFilePtr' );
 dcl     DosWrite            entry( fixed bin(31),    /* hFile       */
                                    ptr,              /* pBuffer     */
                                    fixed bin(31),    /* cbWritten   */
                                    ptr )             /* pcbActual   */
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosWrite' );

 /*-----------------------------------*/
 /* Queries                           */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* Settings                          */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* File Systems                      */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* General                           */
 /*-----------------------------------*/
 dcl     DosBeep             entry( fixed bin(31), fixed bin(31) )
                             returns( fixed bin(31) ) /*unsigned */
                             external( 'DosBeep' )
                             options(asm byvalue linkage(system) );
 dcl     DosShutdown         entry( fixed bin(31) )
                             returns( fixed bin(31) ) /*unsigned */
                             external( 'DosShutdown' )
                             options(asm byvalue linkage(system) );

 /*-----------------------------------*/
 /* Memory Management                 */
 /*-----------------------------------*/
 dcl     DosAllocMem         entry( ptr,
                                    fixed bin(31) /* unsigned */,
                                    bit(32) )
          /* Flag definitions for DosAllocMem  */
          /* and DosSetMem                     */
          /* OBJ_TILE      '40000000'bx        */
          /* PAG_COMMIT    '10000000'bx        */
          /* PAG_GUARD     '08000000'bx        */
          /* PAG_EXECUTE   '04000000'bx        */
          /* PAG_WRITE     '02000000'bx        */
          /* PAG_READ      '01000000'bx        */
                             returns( fixed bin(31) /* unsigned */ )
                             external( 'DosAllocMem' )
                             options(asm byvalue linkage(system) );
 dcl     DosFreeMem          entry( ptr )
                             returns( fixed bin(31) /* unsigned */ )
                             external( 'DosFreeMem' )
                             options(asm byvalue linkage(system) );
 dcl     DosSetMem           entry(
                                    ptr,              /* pp          */
                                    fixed bin(31),    /* cb(UNSIGNED)*/
                                    bit(32)           /* flag        */
                                  )
                             external( 'DosSetMem' )
                             returns( fixed bin(31) ) /* APIRET      */
                             options(asm byvalue linkage(system) );

 dcl     DosSubAllocMem      entry(
                                    ptr,              /* pbBase      */
                                    ptr,              /* ppb         */
                                    fixed bin(31)     /* cb(UNSIGNED)*/
                                  )
                             external( 'DosSubAllocMem' )
                             returns( fixed bin(31) ) /* APIRET      */
                             options(asm byvalue linkage(system) );
 dcl     DosSubFreeMem       entry(
                                    ptr,              /* pbBase      */
                                    ptr,              /* ppb         */
                                    fixed bin(31)     /* cb(UNSIGNED)*/
                                  )
                             external( 'DosSubFreeMem' )
                             returns( fixed bin(31) ) /* APIRET      */
                             options(asm byvalue linkage(system) );

 /*-----------------------------------*/
 /* Message Management                */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* National Language Support         */
 /*-----------------------------------*/
 dcl      DosMapCase         entry( fixed bin(31),    /* cb          */
                                    ptr,              /* pcc         */
                                    ptr )             /* pch         */
                             returns( fixed bin(31) )
                             options( asm byvalue linkage(system) )
                             ext( 'DosMapCase' );

 dcl    1 COUNTRYCODE        unaligned based,
          5 country          fixed bin(31),
          5 codepage         fixed bin(31);

 /*-----------------------------------*/
 /* Pipes                             */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* Processes, Threads, and Sessions  */
 /*-----------------------------------*/
 dcl     DosEnterCritSec     entry
                             returns( fixed bin(31) /*unsigned*/ )
                             external( 'DosEnterCritSec' );
                             options(asm byvalue linkage(system) );
 dcl     DosExitCritSec      entry
                             returns( fixed bin(31) /*unsigned*/ )
                             external( 'DosExitCritSec' )
                             options(asm byvalue linkage(system) );
 dcl     DosExit             entry( fixed bin(31), fixed bin(31) )
                             external( 'DosExit' )
                             options(asm byvalue linkage(system) );
 dcl     DosGetInfoBlocks    entry(ptr,ptr)
                             external( 'DosGetInfoBlocks' )
                             returns( fixed bin(31) ) /* unsigned */
                             options(asm byvalue linkage(system) );

 /*-----------------------------------*/
 /* Query System Information          */
 /*-----------------------------------*/
 dcl     DosQuerySysInfo     entry( fixed bin(31),    /* ulStartIndex*/
                                    fixed bin(31),    /* ulLastIndex */
                                    ptr,              /* pDataBuf    */
                                    fixed bin(31) )   /* ulDataBufLen*/
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosQuerySysInfo' );
 dcl      DosScanEnv         entry( ptr,              /* pszName     */
                                    ptr )             /* ppszValue   */
                             returns( fixed bin(31) )
                             options( asm byvalue linkage(system) )
                             ext( 'DosScanEnv' );

 /*-----------------------------------*/
 /* Queues                            */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* Resource Objects                  */
 /*-----------------------------------*/

 /*-----------------------------------*/
 /* Semaphores                        */
 /*-----------------------------------*/
 dcl     DosCloseMutexSem    entry( fixed bin(31) )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosCloseMutexSem' );
 dcl     DosCreateMutexSem   entry( ptr, ptr,
                                    fixed bin(31), fixed bin(31) )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosCreateMutexSem' );
 /* DosOpenMutexSem                   */
 dcl     DosRequestMutexSem  entry( fixed bin(31), fixed bin(31) )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosRequestMutexSem' );
 dcl     DosReleaseMutexSem  entry( fixed bin(31) )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosReleaseMutexSem' );
 /* DosQueryMutexSem                  */
 dcl     DosCloseEventSem    entry( fixed bin(31) )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosCloseEventSem' );
 dcl     DosCreateEventSem   entry( ptr, ptr,
                                    fixed bin(31), fixed bin(31) )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosCreateEventSem' );
 /* DosOpenMutexSem                   */
 dcl     DosPostEventSem     entry( fixed bin(31) )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosPostEventSem' );
 /* DosQueryEventSem                  */
 dcl     DosResetEventSem    entry( fixed bin(31), ptr )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosResetEventSem' );
 dcl     DosWaitEventSem     entry( fixed bin(31), fixed bin(31) )
                             returns( fixed bin(31) /*unsigned*/ )
                             options(asm byvalue linkage(system) )
                             external( 'DosWaitEventSem' );
 /* DosAddMuxWaitSem                  */
 /* DosCloseMuxWaitSem                */
 /* DosCreateMuxWaitSem               */
 /* DosDeleteMuxWaitSem               */
 /* DosOpenMuxWaitSem                 */
 /* DosQueryMuxWaitSem                */
 /* DosWaitMuxWaitSem                 */

 /*-----------------------------------*/
 /* Timers                            */
 /*-----------------------------------*/
 /* DosAsyncTimer                     */
 /* DosStartTimer                     */
 /* DosStopTimer                      */

