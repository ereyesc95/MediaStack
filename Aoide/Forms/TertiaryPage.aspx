<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="TertiaryPage.aspx.cs" Inherits="Aoide.Forms.TertiaryPage" %>

<!DOCTYPE html>

<html xmlns="http://www.w3.org/1999/xhtml">
<head runat="server">
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous" />
    <script src="https://kit.fontawesome.com/94497f0b57.js" crossorigin="anonymous"></script>
    <link href='https://fonts.googleapis.com/css?family=Lexend' rel='stylesheet' />
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdn.materialdesignicons.com/5.4.55/css/materialdesignicons.min.css" />
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkNavBar" href="~/Styles/NavBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkStyles" href="~/Styles/Main.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSectionBar" href="~/Styles/SectionBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSlider" href="~/Styles/splide-teal.min.css" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>MediaBinger</title>
</head>
<body runat="server" id="bodyThirdPage" class="nonblur-bgimage">
    
    <form id="form3" runat="server" onsubmit="return false;">
        <div id="nav-placeholder"></div>
        <div runat="server" id="pageIndex2" style="float: left; width: 73%; margin-right: 0; margin-left: 0; margin-top: -20px; text-align: center">
            <a runat="server" id="appPageIndex2" href="javascript:void(0)" style="font-size: 26px; text-decoration: none; color: aliceblue; display: inline; float: none">
                <img runat="server" id="logoTop" src="/Images/System/logo-main.png" class="colorImage" style="margin-top: -5px; height: 50px" />
            </a>
            <span runat="server" id='LogoSpan' class='logo_span' style="display: none; font-size: 22px; cursor: default"></span>
        </div>
        <div runat="server" id="filterSearchSec" class="divSubFilter divSubFilterSearch">
            <input id="SubFilterOptSec" class="subfilterOptionSec FilterSearch form-control" type="text" data-id="0" placeholder="Search" data-field="0" style="width: 150px; margin-top: -12px; margin-left: -50px" list="lstSearchFilterSec" />
            <datalist id="lstSearchFilterSec"></datalist>
        </div>
        <br />
        <div runat="server" id="barNavSection" name="barNavSection" class="topnav" style="margin-top: 10px">
        </div>
        <div runat="server" id="filterBarSection" name="filterBar1" class="filternav barnav" style="margin-top: 1px">
        </div>
        <div runat="server" id="filterBarSection2" name="filterBar1_2" class="filternav2 barnav" style="margin-top: 1px">
        </div>
        <div runat="server" id="subFilterBarSection" name="filterBar2" class="subfilternav barnav" style="margin-top: 1px">
        </div>
        <input runat="server" id="subMenuItems" type="text" class="inputFileFields" style="display: none" />


        <div runat="server" id="divContainer" class="d-flex flex-row" style="margin-top: 5px; margin-bottom: 10px; margin-left: 10px; display: block">
            <div runat="server" id="imgNavButtons" class="overDiv d-flex flex-row" style="display: none; height: 750px">

                <input runat="server" id="txtLogos" type="text" class="inputFileFields" data-value="15." style="display: none" />
                <input runat="server" id="txtIcons" type="text" class="inputFileFields" data-value="15." style="display: none" />
                <input runat="server" id="txtPosters" type="text" class="inputFileFields" data-value="14." style="display: none" />
                <input runat="server" id="txtWalls" type="text" class="inputFileFields" data-value="14." style="display: none" />
                <input runat="server" id="txtPaths" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="imgTitle" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtWriters" type="text" class="inputFileFields" style="display: none" />

                <input runat="server" id="txtArtistName" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtArtistID" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtRelease" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtProducer" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtCover" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtDisc" type="text" class="inputFileFields rotate" style="display: none" />
                <input runat="server" id="txtBack" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtSinglesPath" type="text" class="inputFileFields" style="display: none" />


                <input runat="server" id="txtRelGenres" type="text" class="inputFileFields" data-value="14." style="display: none" />
                <input runat="server" id="txtRelProducers" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtRelLabel" type="text" class="inputFileFields" style="display: none" />
                
                <asp:Button ID="relSubmit" runat="server" Text="✔" CssClass="btn btn-mini"  Style="display: none; color: aliceblue; opacity:0.4" />

            </div>
            <div runat="server" id="divContainerLeft" class="ReleaseContainer col-5 divContLeft divContThir" style="height: 795px; margin-bottom: 10px; overflow: hidden;">
                <video runat="server" id="vidCanvas" width="672" height="1017" autoplay muted loop style="float: left; margin-top: -70px; margin-left: -70px; position:absolute; z-index: -1;opacity:0.4">
                        <source runat="server" id="canvasSource" src="" /></video>
                <div runat="server" id="divContainerAlbum" class="divContTop" style="display: table; margin: 0 auto; height: 310px; margin-bottom: 10px; overflow: hidden; z-index: 100">
                    <img runat="server" id="imgDisc" class="divContTop blur-bgimage" src="/Images/System/logo-main.png" style="float: right; margin-top: 10px; margin-left: 140px; height: 300px; max-width: 100%" />
                    <img runat="server" id="imgCover" class="divContTop blur-bgimage" src="/Images/System/logo.png" style="float: left; margin-top: 10px; margin-left: -15px; height: 300px; max-width: 100%; position:absolute; cursor:pointer" />
                    <img runat="server" id="imgAltDisc" class="divContTop blur-bgimage" src="/Images/System/logo.png" style="visibility: hidden; float: left; margin-top: 10px; margin-left: -15px; height: 300px; max-width: 100%; position:absolute; cursor:pointer" />
                    <video runat="server" id="vidCover" width="300" height="300" autoplay muted loop style="float: left; margin-top: 10px; margin-left: -15px;position:absolute; cursor:pointer">
                        <source runat="server" id="vidSource" src="" /></video>

                </div>
                <div runat="server" id="divContainerAlbumData" class="divContTop" style="display: table; margin: 0 auto; height: 300px; width: 100%; margin-bottom: 10px; overflow: hidden; font-size: 12px">
                    <div runat="server" id="divArtistLogos" name="divArtistLogos" style="display: table; margin: 0 auto; padding-top: 20px; padding-bottom: 20px">
                        <a runat="server" id="aBandPage" class="aBandPage" href="javascript:void(0)" style="font-size: 26px; text-decoration: none; color: aliceblue; display: inline; float: none; cursor: pointer">
                            <img runat="server" id="iconBand" class="colorImage" src="/Images/System/icon-empty.png" style="margin-top: -5px; height: 50px" />
                            <img runat="server" id="logoBand" class="colorImage" src="/Images/System/logo-empty.png" style="margin-top: -5px; height: 50px" />
                        </a>
                    </div>
                    <div runat="server" id="divAlbumDetails" style="margin-top: 15px">
                        <span runat="server" id="spaType" class="spaAlbumData"></span>
                        <span runat="server" id="spaTaken" class="spaAlbumData"></span>
                        <span runat="server" id="spaDate" class="spaAlbumData"></span>
                        <span runat="server" id="spaGen" class="spaEditRelItem spaAlbumData" title="click to edit" style="text-align: center;cursor:pointer"></span>
                        <div style="text-align: center;">
                            <span runat="server" id="spaProd" title="click to edit" class="spaEditRelItem spaAlbumData" style="cursor:pointer"></span>
                        </div>
                        <span runat="server" id="spaRev" class="spaAlbumData"></span>
                        <img runat="server" id="imgLabel" class="spaAlbumData" src="/Images/System/logo-main.png" style="display: none; margin: 0 auto; margin-top: 12px; height: 30px; max-width: 70%" />
                        <span runat="server" id="spaLabel" title="click to edit" class="spaEditRelItem spaAlbumData" style="padding-top: -12px;cursor:pointer"></span>
                    </div>

                    <div runat="server" id="divTrackDetails" style="display: none; font-size: 16px; text-align: center; margin-top: -205px">

                        <p runat="server" id="traTitle" class="spaTrackData"></p>
                        <p runat="server" id="traCover" class="spaTrackData"></p>
                        <p runat="server" id="traOriginal" class="spaTrackData"></p>
                        <p runat="server" id="traFeat" class="spaTrackData"></p>
                        <p runat="server" id="traRelease" class="spaTrackData"></p>
                        <p runat="server" id="traDate" class="spaTrackData"></p>
                        <p runat="server" id="traWriters" class="spaWriterData" style="font-size:10px;"></p>
                        <input runat="server" id="txtWriterField" type="text" class="inputFileFields" style="width: 60%;display: none;margin: 0 auto;margin-bottom:2px" />
                    </div>
                </div>
                <div runat="server" id="divRelNav" name="divExtraData" class="divContTop" style="display: table; margin: 0 auto; height: 310px; width: 100%; margin-bottom: 10px; overflow: hidden; font-size: 12px">
                    <div runat="server" id="divCodes" name="divCodes" style="display: table; margin: 0 auto">
                        <a runat="server" id="codeLink" class="codeLink" href="javascript:void(0)" style="font-size: 26px; text-decoration: none; color: aliceblue; display: inline; float: none; cursor:default">
                            <img runat="server" id="codeSpotify" class="colorImage" style="margin-top: -5px; height: 100px" />
                            <img runat="server" id="codeQR" class="colorImage" style="margin-top: -5px; height: 100px" />
                        </a>
                    </div>
                    <div runat="server" id="divExtraData" name="divExtraData" class="colorImage" style="height: 80px"></div>
                    <div runat="server" id="divQR" name="divQR" class="colorImage" style="height: 80px"></div>

                    <div runat="server" id="divPlayer" style="visibility: hidden; margin-top:-27px">
                        <div class="divProgressBar row">
                            <audio src="" id="player"></audio> 
                            <div id="progressAmountBack" class="hp_slide divProgress col-12" style="cursor: pointer">
                                <div id="progressAmount" class="hp_range" style="cursor: pointer"></div>
                            </div>
                        </div>
                        <div class="row divPlayerButtons" style="margin-top:2px">
                            <div id="butPrevTrack" class="divPrevTrack col-4" style="display: flex; justify-content: center;">
                                <a runat="server" id="aPrevTrack" href="javascript:void(0)" class="aPlayer coloredText" title="Previous" style="cursor: pointer; font-weight: bold; float: left"><i class="fa fa-angle-left"></i></a>
                            </div>
                            <div class="divPlayTrack col-4" style="display: flex; justify-content: center;">
                                <a runat="server" id="aPlayTrack" href="javascript:void(0)" class="aPlayer aPlay coloredText" title="Play" style="cursor: pointer; font-weight: bold; "><i class="fa fa-play"></i></a>
                                <a runat="server" id="aPauseTrack" href="javascript:void(0)" class="aPlayer aPause coloredText" title="Pause" style="display:none; cursor: pointer; font-weight: bold; "><i class="fa fa-pause"></i></a>
                            </div>
                            <div id="butNextTrack" class="divNextTrack col-4" style="display: flex; justify-content: center;">
                                <a runat="server" id="aNextTrack" href="javascript:void(0)" class="aPlayer coloredText" title="Next" style="cursor: pointer; font-weight: bold;"><i class="fa fa-angle-right"></i></a>
                            </div>
                        </div>
                    </div>
                    
                    <div runat="server" id="divNavRel" name="divNavRel" style="padding-top: 20px">
                        <a runat="server" id="aRelPrev" href="javascript:void(0)" class="aAlbumPage aRelNav coloredText" title="" style="margin-left: 10px; cursor: pointer; font-weight: bold; float: left">Previous</a>
                        <a runat="server" id="aRelNext" href="javascript:void(0)" class="aAlbumPage aRelNav coloredText" title="" style="margin-right: 10px; cursor: pointer; font-weight: bold; float: right">Next</a>
                    </div>
                    <div runat="server" id="divTrackButtons" class="row" style="margin-top: -1px; margin-left: 140px; visibility: hidden">
                        <div runat="server" id="divReturnTracklist" class="col col-2"></div>
                        <div runat="server" id="divLyrics" class="col col-2">
                            <a runat="server" id="butLyrics" href="javascript:void(0)" class="aTrackButtons coloredText" title="Lyrics" style="text-decoration: none; cursor: pointer; font-weight: bold;"><i class="fa fa-microphone-lines"></i></a>
                            <a runat="server" id="butReturnTracklistLyr" href="javascript:void(0)" class="butReturnTracklist aTrackButtons coloredText" title="Return to Tracklist" style="text-decoration: none; cursor: pointer; font-weight: bold; display: none"><i class="fa fa-arrow-left"></i></a>

                        </div>
                        <div runat="server" id="divVersions" class="col col-2">
                            <a runat="server" id="butVersions" href="javascript:void(0)" class="aTrackButtons coloredText" title="Versions" style="text-decoration: none; cursor: pointer; font-weight: bold;"><i class="fa fa-diagram-project"></i></a>
                            <a runat="server" id="butReturnTracklistVer" href="javascript:void(0)" class="butReturnTracklist aTrackButtons coloredText" title="Return to Tracklist" style="text-decoration: none; cursor: pointer; font-weight: bold; display: none"><i class="fa fa-arrow-left"></i></a>
                        </div>
                        <div runat="server" id="divPlaylist" class="col col-2">
                            <a runat="server" id="butPlaylist" href="javascript:void(0)" class="aTrackButtons coloredText" title="Add to playlist" style="text-decoration: none; cursor: pointer; font-weight: bold;"><i class="fa fa-plus"></i></a>
                        </div>
                        <div runat="server" id="divVideos" class="col col-2"><a runat="server" id="butVideos" href="javascript:void(0)" target="_blank" class="aTrackButtons coloredText" title="Video" style="text-decoration: none; cursor: pointer; font-weight: bold;"><i class="fa fa-youtube"></i></a></div>
                    </div>
                </div>
            </div>
            <div runat="server" id="divContainerRight" class="col-7 divContThir divContRight">
                <div runat="server" id="divAlbumGeneral">
                    <div runat="server" id="divArtistSummary">
                        <asp:TextBox runat="server" ID="aboutTextBox" CssClass="scrollabletextbox-sm" ReadOnly="true" TextMode="MultiLine" Rows="100" />
                    </div>
                    <div runat="server" id="divArtistGeneral" class="infoDiv scrollableDiv-lg" style="margin-top: -5px">
                        <div runat="server" id="divImage" class="row" name="divPersonnel" style="text-align: center; margin: auto; font-size: 15px; padding-top: 2px; padding-bottom: 2px; margin-top: 2px; margin-bottom: 30px">
                        </div>
                        <div runat="server" id="divPersonnel" name="divPersonnel" class="topnav" style="font-size: 15px; padding-top: 2px; padding-bottom: 2px; margin-bottom: 10px">
                        </div>
                        <div runat="server" id="divSingles" name="divSingles" class="topnav" style="display: none; font-size: 15px; padding-top: 2px; padding-bottom: 2px; margin-top: 20px">
                        </div>
                    </div>
                    <div runat="server" id="divContainerTracks" class="divContThir col-12 scrollableDiv-gi" style="float: right; margin-top: -770px; visibility: hidden">
                    </div>
                    <div runat="server" id="divContainerVersions" class="divContThir col-12 scrollableDiv-gi" style="float: right; margin-top: -770px; visibility: hidden">
                    </div>
                    <div runat="server" id="divContainerLyrics" class="divContThir col-12 scrollableDiv-gi" style="float: right; margin-top: -770px; visibility: hidden; display: flex; justify-content: center;">
                    </div>
                </div>
            </div>
        </div>

        <div runat="server" id="contentContainer" name="contentSection">
            <div runat="server" id="contentSection" name="contentSection" class="content" style="position: absolute; top: 190px;">
                <p runat="server" id="testString" style="display: none"></p>
                <p runat="server" id="testID" style="display: none"></p>
            </div>
        </div>
        <div runat="server" id="subcontentContainer" class="" name="subcontentSection ">
            <div runat="server" id="subcontentSection" name="subcontentSection" class="content scrollableItemsDiv" style="position: absolute; top: 120px;">
            </div>
            <div runat="server" id="subcontentSection2" name="subcontentSection2" class="content scrollableItemsDiv" style="position: absolute; top: 120px;">
            </div>
            <div runat="server" id="subcontentSection3" name="subcontentSection3" class="content scrollableItemsDiv" style="position: absolute; top: 120px;">
            </div>
        </div>

        <div id="playlistDataModal" class="modal fade">
            <div id='modalPlaylistDataDiv' data-toggle='modal' data-target='#playlistDataModal' runat="server"></div>
            <div id='playlisttModal' class="modal-dialog modal-dialog-centered modal-sm">
                <div id='subModalPlaylistData' class="modal-content" style="background-color: #121212; margin-left: -88%">
                    <iframe id="playlistDataFrame" src="/Forms/PlaylistData.aspx" scrolling="no" style="min-height: 237px; height: 237px; width: 855px; border: none; border-radius: 10px"></iframe>
                </div>
            </div>
        </div>

        <div id="divGalleryContainer" class="modal fade">
            <div id='modalGalleryDataDiv' data-toggle='modal' data-target='#divGalleryContainer' runat="server"></div>
            <div id='divGalleryModal' class="modal-dialog modal-dialog-centered modal-sm">
                <div id='subModalGallery' class="modal-content" style="background-color: #121212; margin-left: -88%">
                    <iframe id="galleryFrame" src="/Forms/GalleryModal.aspx" scrolling="no" style="min-height: 700px;height: 700px; width: 900px; border: none; border-radius: 10px"></iframe>
                </div>
            </div>
        </div>
    </form>

    <script src="https://code.jquery.com/jquery-3.6.0.js" integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk=" crossorigin="anonymous"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="/JS/Navbar.js" type="text/javascript"></script>
    <script src="/JS/SectionBar.js" type="text/javascript"></script>
    <script src="/JS/SecondPage.js" type="text/javascript"></script>
    <script src="/JS/Splide.min.js"></script>
    
    <script src="https://code.jquery.com/ui/1.12.1/jquery-ui.js" integrity="sha256-T0Vest3yCU7pafRw9r+settMBX6JkKN06dqBnpQ8d30=" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.9.0/js/bootstrap-datepicker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    
    <script>
        var HeartBeatTimer;

        function StartHeartBeat() {
            // pulse every 5 seconds
            if (HeartBeatTimer == null)
                HeartBeatTimer = setInterval("HeartBeat()", 1000 * 30);
        }

        function HeartBeat() {
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/PrimaryPage.aspx/PokePage",
                data: JSON.stringify({
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                }
            });
        }

        StartHeartBeat();
    </script>
</body>
</html>
