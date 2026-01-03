 dcl    1 filestatus4         based,
          5 fdateCreation     bit(16),            /* Creation d/t    */                    
          5 ftimeCreation     bit(16),
          5 fdateLastAccess   bit(16),            /* Access d/t      */
          5 ftimeLastAccess   bit(16),
          5 fdateLastWrite    bit(16),            /* Write d/t       */
          5 ftimeLastWrite    bit(16),
          5 cbFile            fixed bin(31),      /* Curr file size  */
          5 cbFileAlloc       fixed bin(31),      /* Alloc file size */
          5 attrFile          bit(16);            /* File Attributes */

%replace FILE_NORMAL    by  '0000'bx;
%replace FILE_READONLY  by  '0100'bx;
%replace FILE_HIDDEN    by  '0200'bx;
%replace FILE_SYSTEM    by  '0400'bx;
%replace FILE_DIRECTORY by  '0010'bx;
%replace FILE_ARCHIVED  by  '0020'bx;

          /* FDATE and FTIME must be byte-swapped before unpacking   */
 dcl    1 fdate               unaligned based,    /* File date format*/
          5 year              bit(7),
          5 month             bit(4),
          5 day               bit(5);

 dcl    1 ftime               unaligned based,    /* File time format*/
          5 hours             bit(5),
          5 minutes           bit(6),
          5 twosecs           bit(5);             /* Two-second ticks*/
