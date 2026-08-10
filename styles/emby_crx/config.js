/* ============================================================
   emby-crx 轮播配置 (config.js)
   ⚠️ 重要: parentId 必须配置为你 Emby 的媒体库 ID!
   - 多个用逗号分隔: "id1,id2,id3"
   - 获取方式: Emby 后台 → 媒体库 → URL 中的 parentId 参数
   - 或: 打开首页后按 F12, 执行 ApiClient.getUserViews() 查看
   - 留空("")则轮播不显示!
   ⚠️ 本工具(emby-beautify)安装时不会覆盖已配置的 config.js
   ============================================================ */

class Config{
	constructor() {
		//媒体库id，用逗号分隔。进入媒体库后url里的parentId
		//this.parentId = "";
                this.parentId = "";
		//滚屏间隔 ms
		this.interval = 8000;
		//是否开启随机
		this.random = true;
		this.itemQuery={
			//返回横幅的最大数量，注意每10个为一轮，一轮不足10个的会被舍弃。例如27则只显示两轮20个
			Limit : 20,//(integer) Optional. The maximum number of records to return
			
			//一般只需要关注上面几个配置，下面不了解的不需要修改
			/*-------------------------------------------------------------------------------------------------------------------------------*/
			Recursive : true,//(boolean) When searching within folders, this determines whether or not the search will be recursive. true/false
			SortOrder : "Descending",//(string) Sort Order - Ascending,Descending
			Fields : "ProductionYear",//(string) Optional. Specify additional fields of information to return in the output. This allows multiple, comma delimeted. Options: Budget, Chapters, DateCreated, Genres, HomePageUrl, IndexOptions, MediaStreams, Overview, ParentId, Path, People, ProviderIds, PrimaryImageAspectRatio, Revenue, SortName, Studios, Taglines
			EnableUserData : "",//(boolean) Optional, include user data
			ImageTypeLimit : 1,//(integer) Optional, the max number of images to return, per image type
			Fields : "ProductionYear",//(string) Optional. Specify additional fields of information to return in the output. This allows multiple, comma delimeted. Options: Budget, Chapters, DateCreated, Genres, HomePageUrl, IndexOptions, MediaStreams, Overview, ParentId, Path, People, ProviderIds, PrimaryImageAspectRatio, Revenue, SortName, Studios, Taglines
			IncludeItemTypes : "Movie,Series",//(string) Optional. If specified, results will be filtered based on item type. This allows multiple, comma delimeted.
			ImageTypes : "Backdrop",//(string) Optional. If specified, results will be filtered based on those containing image types. This allows multiple, comma delimited.
			EnableImageTypes : "Logo,Backdrop",//(string) Optional. The image types to include in the output.
			SortBy : "ProductionYear, PremiereDate, SortName",//(string) Optional. Specify one or more sort orders, comma delimeted. Options: Album, AlbumArtist, Artist, Budget, CommunityRating, CriticRating, DateCreated, DatePlayed, PlayCount, PremiereDate, ProductionYear, SortName, Random, Revenue, Runtime
			ArtistType : "",//(string) Artist or AlbumArtist
			MaxOfficialRating : "",//(string) Optional filter by maximum official rating (PG, PG-13, TV-MA, etc).
			HasThemeSong : "",//(boolean) Optional filter by items with theme songs.
			HasThemeVideo : "",//(boolean) Optional filter by items with theme videos.
			HasSubtitles : "",//(boolean) Optional filter by items with subtitles.
			HasSpecialFeature : "",//(boolean) Optional filter by items with special features.
			HasTrailer : "",//(boolean) Optional filter by items with trailers.
			AdjacentTo : "",//(string) Optional. Return items that are siblings of a supplied item.
			MinIndexNumber : "",//(integer) Optional filter by minimum index number.
			MaxPlayers : "",//(integer) Optional filter by minimum number of game players.
			ParentIndexNumber : "",//(integer) Optional filter by parent index number.
			HasParentalRating : "",//(integer) Optional filter by items that have or do not have a parental rating
			IsHD : "",//(boolean) Optional filter by items that are HD or not.
			LocationTypes : "",//(string) Optional. If specified, results will be filtered based on LocationType. This allows multiple, comma delimeted.
			ExcludeLocationTypes : "",//(string) Optional. If specified, results will be filtered based on LocationType. This allows multiple, comma delimeted.
			IsMissing : "",//(boolean) Optional filter by items that are missing episodes or not.
			IsUnaired : "",//(boolean) Optional filter by items that are unaired episodes or not.
			MinCommunityRating : "",//(number) Optional filter by minimum community rating.
			MinCriticRating : "",//(number) Optional filter by minimum critic rating.
			AiredDuringSeason : "",//(integer) Gets all episodes that aired during a season, including specials.
			MinPremiereDate : "",//(string) Optional. The minimum premiere date. Format = ISO
			MinDateLastSaved : "",//(string) Optional. The minimum premiere date. Format = ISO
			MinDateLastSavedForUser : "",//(string) Optional. The minimum premiere date. Format = ISO
			MaxPremiereDate : "",//(string) Optional. The maximum premiere date. Format = ISO
			HasOverview : "",//(boolean) Optional filter by items that have an overview or not.
			HasImdbId : "",//(boolean) Optional filter by items that have an imdb id or not.
			HasTmdbId : "",//(boolean) Optional filter by items that have a tmdb id or not.
			HasTvdbId : "",//(boolean) Optional filter by items that have a tvdb id or not.
			ExcludeItemIds : "",//(string) Optional. If specified, results will be filtered by exxcluding item ids. This allows multiple, comma delimeted.
			StartIndex : "",//(integer) Optional. The record index to start at. All items with a lower index will be dropped from the results.
			ExcludeItemTypes : "",//(string) Optional. If specified, results will be filtered based on item type. This allows multiple, comma delimeted.
			AnyProviderIdEquals : "",//(string) Optional. If specified, result will be filtered to contain only items which match at least one of the specified IDs. Each provider ID must be in the form 'prov.id', e.g. 'imdb.tt123456'. This allows multiple, comma delimeted value pairs.
			Filters : "",//(string) Optional. Specify additional filters to apply. This allows multiple, comma delimeted. Options: IsFolder, IsNotFolder, IsUnplayed, IsPlayed, IsFavorite, IsResumable, Likes, Dislikes
			IsFavorite : "",//(boolean) Optional filter by items that are marked as favorite, or not.
			IsMovie : "",//(boolean) Optional filter for movies.
			IsSeries : "",//(boolean) Optional filter for movies.
			IsNews : "",//(boolean) Optional filter for news.
			IsKids : "",//(boolean) Optional filter for kids.
			IsSports : "",//(boolean) Optional filter for sports.
			MediaTypes : "",//(string) Optional filter by MediaType. Allows multiple, comma delimited.
			IsPlayed : "",//(string) Optional filter by items that are played, or not.
			Genres : "",//(string) Optional. If specified, results will be filtered based on genre. This allows multiple, pipe delimeted.
			OfficialRatings : "",//(string) Optional. If specified, results will be filtered based on OfficialRating. This allows multiple, pipe delimeted.
			Tags : "",//(string) Optional. If specified, results will be filtered based on tag. This allows multiple, pipe delimeted.
			Years : "",//(string) Optional. If specified, results will be filtered based on production year. This allows multiple, comma delimeted.
			EnableImages : "",//(boolean) Optional, include image information in output
			Person : "",//(string) Optional. If specified, results will be filtered to include only those containing the specified person.
			PersonIds : "",//(string) Optional. If specified, results will be filtered to include only those containing the specified person.
			PersonTypes : "",//(string) Optional. If specified, along with Person, results will be filtered to include only those containing the specified person and PersonType. Allows multiple, comma-delimited
			Studios : "",//(string) Optional. If specified, results will be filtered based on studio. This allows multiple, pipe delimeted.
			StudioIds : "",//(string) Optional. If specified, results will be filtered based on studio. This allows multiple, pipe delimeted.
			Artists : "",//(string) Optional. If specified, results will be filtered based on artist. This allows multiple, pipe delimeted.
			ArtistIds : "",//(string) Optional. If specified, results will be filtered based on artist. This allows multiple, pipe delimeted.
			Albums : "",//(string) Optional. If specified, results will be filtered based on album. This allows multiple, pipe delimeted.
			Ids : "",//(string) Optional. If specific items are needed, specify a list of item id's to retrieve. This allows multiple, comma delimited.
			VideoTypes : "",//(string) Optional filter by VideoType (videofile, dvd, bluray, iso). Allows multiple, comma delimeted.
			Containers : "",//(string) Optional filter by Container. Allows multiple, comma delimeted.
			AudioCodecs : "",//(string) Optional filter by AudioCodec. Allows multiple, comma delimeted.
			VideoCodecs : "",//(string) Optional filter by VideoCodec. Allows multiple, comma delimeted.
			SubtitleCodecs : "",//(string) Optional filter by SubtitleCodec. Allows multiple, comma delimeted.
			Path : "",//(string) Optional filter by Path.
			UserId  : "",//(string) User Id
			MinOfficialRating : "",//(string) Optional filter by minimum official rating (PG, PG-13, TV-MA, etc).
			IsLocked : "",//(string) Optional filter by items that are locked.
			IsPlaceHolder : "",//(boolean) Optional filter by items that are placeholders
			HasOfficialRating : "",//(boolean) Optional filter by items that have official ratings
			GroupItemsIntoCollections : "",//(boolean) Whether or not to hide items behind their boxsets.
			Is3D : "",//(boolean) Whether or not to hide items behind their boxsets.
			SeriesStatus : "",//(string) Optional filter by Series Status. Allows multiple, comma delimeted.
			NameStartsWithOrGreater : "",//(string) Optional filter by items whose name is sorted equally or greater than a given input string.
			NameStartsWith : "",//(string) Optional filter by items whose name is sorted equally than a given input string.
			NameLessThan : ""//(string) Optional filter by items whose name is equally or lesser than a given input string.
		}
		
		Object.getOwnPropertyNames(this.itemQuery).forEach(key => {
			if(this.itemQuery[key]==""){
				delete this.itemQuery[key];
			}
		})
		
		this.parentIds = this.parentId.split(',');
	}
}