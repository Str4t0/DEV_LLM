/*--------------------------------------------------------*/
/*        PL/I equivalent of sys/stat.h                   */
/*--------------------------------------------------------*/ 
dcl     1 stat                based,                         
          5 st_dev            fixed bin(31),      /* ID of device    */               
          5 st_ino            fixed bin(31),      /* inode number    */
          5 st_mode           fixed bin(31),      /* protection      */
          5 st_nlink          fixed bin(31),      /* num hard links  */
          5 st_uid            fixed bin(31),      /* user ID of owner*/
          5 st_gid            fixed bin(31),      /* grp ID of owner */
          5 st_rdev           fixed bin(31),      /* dev ID (special)*/
          5 st_size           fixed bin(31),      /* tot size bytes  */
          5 st_blksize        fixed bin(31),      /* blksz file sys  */
          5 st_blocks         fixed bin(31),      /* num 512B blks al*/
          5 st_atime          fixed bin(31),      /* time last access*/
          5 st_mtime          fixed bin(31),      /* time last mod   */
          5 st_ctime          fixed bin(31);      /* time last stat c*/
/* File Permissions */
/* Values for st_mode, munged up because of the blasted   */
/* C practice of conflating bit strings in memory with    */
/* integers in registers.  After swapping the bytes,      */
/* here's what we have:                                   */
%replace S_ISUID by '00080000'bx;
%replace S_ISGID by '00040000'bx;
%replace S_RUSR  by '00010000'bx;
%replace S_WUSR  by '80000000'bx;
%replace S_XUSR  by '40000000'bx;
%replace S_RGRP  by '20000000'bx;
%replace S_WGRP  by '10000000'bx;
%replace S_XGRP  by '08000000'bx;
%replace S_ROTH  by '04000000'bx;
%replace S_WOTH  by '02000000'bx;
%replace S_XOTH  by '01000000'bx;
