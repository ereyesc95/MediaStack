<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="SecondaryPage.aspx.cs" Inherits="Aoide.Forms.SecondaryPage" %>

<!DOCTYPE html>

<html xmlns="http://www.w3.org/1999/xhtml">
<head runat="server">
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous" />
    <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.6.1/css/font-awesome.min.css" rel="stylesheet" />
    <link href='https://fonts.googleapis.com/css?family=Lexend' rel='stylesheet' />
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdn.materialdesignicons.com/5.4.55/css/materialdesignicons.min.css" />
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkStyles" href="~/Styles/Main.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkNavBar" href="~/Styles/NavBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSectionBar" href="~/Styles/SectionBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSlider" href="~/Styles/splide-teal.min.css" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>MediaBinger</title>
</head>
<body runat="server" id="bodySecondPage" class="blur-bgimage">

    <form id="form2" runat="server">
        <div id="nav-placeholder"></div>
        <div runat="server" id="pageIndex2" style="float: left; width: 73%; margin-right: 0; margin-left: 0; margin-top: -20px; text-align: center">
            <a runat="server" id="appPageIndex2" href="javascript:void(0)" style="font-size: 26px; text-decoration: none; color: aliceblue; display: inline; float: none">
                <img runat="server" id="iconTop" src="/Images/System/logo.png" style="margin-top: -5px; height: 50px" />
                <img runat="server" id="logoTop" src="/Images/System/logo-main.png" style="margin-top: -5px; height: 50px" />
            </a>
            <p runat="server" id="artistNameTop" style="display:none"></p>
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
            <div runat="server" id="imgNavButtons" class="overDiv d-flex flex-row" style="height: 750px">
                <input type="button" id="imgLeftButton" class="imgSwipeButtons" style="background-color: transparent; width: 280px; height: 750px; border: none; outline: none" />
                <input type="button" id="imgRightButton" class="imgSwipeButtons" style="background-color: transparent; width: 280px; height: 750px; border: none; outline: none;" />
                <input runat="server" id="txtLogos" type="text" class="inputFileFields" data-value="15." style="display: none" />
                <input runat="server" id="txtIcons" type="text" class="inputFileFields" data-value="15." style="display: none" />
                <input runat="server" id="txtPosters" type="text" class="inputFileFields" data-value="14." style="display: none" />
                <input runat="server" id="txtWalls" type="text" class="inputFileFields" data-value="14." style="display: none" />
                <input runat="server" id="txtPaths" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="imgTitle" type="text" class="inputFileFields" style="display: none" />
                <input runat="server" id="txtTopTrackPaths" type="text" class="inputFileFields" style="display: none" />
            </div>
            <div runat="server" id="divContainerLeft" class="col-5 divContLeft" style="height: 750px; margin-bottom: 10px; overflow: hidden;">
                <input type="button" id="emptyInput" style="background-color: transparent; width: 500px; height: 750px; border: none" />
            </div>
            <div runat="server" id="divContainerRight" class="col-7 divContRight">
                <div runat="server" id="divArtistSummary">
                    <asp:TextBox runat="server" ID="aboutTextBox" CssClass="scrollabletextbox" ReadOnly="true" TextMode="MultiLine" Rows="100" />
                </div>
                <div runat="server" id="divArtistGeneral" class="infoDiv scrollableDiv" style="margin-top: -15px; margin-bottom: -30px">
                    <table style="font-size: 14px; border-collapse: collapse">
                        <tbody>
                            <tr runat="server" class="trAbout" id="trAlias" style="display: none;">
                                <th scope="row" class="infobox-label thLabel thAbout coloredText">
                                    <p style="padding-top: -15px">Other names</p>
                                </th>
                                <td class="infobox-data tdAbout nickname">
                                    <ul runat="server" class="ulAbout" id="ulAliases">
                                    </ul>
                                </td>
                            </tr>
                            <tr runat="server" class="trAbout" id="trOrigin" style="display: none">
                                <th scope="row" class="infobox-label thLabel thAbout coloredText">
                                    <p style="margin-top: -20px">Origin</p>
                                </th>
                                <td class="infobox-data tdAbout" runat="server" id="tdLocation">
                                    <ul runat="server" class="ulAbout" id="ulOrigin">
                                    </ul>
                                </td>
                            </tr>
                            <tr runat="server" class="trAbout" id="trPeriod" style="display: none;">
                                <th scope="row" class="infobox-label thLabel thAbout coloredText">
                                    <p style="margin-top: 0px">Activity</p>
                                </th>
                                <td class="infobox-data tdAbout">
                                    <ul runat="server" class="ulAbout" id="ulPeriod">
                                    </ul>
                                </td>
                            </tr>
                            <tr runat="server" class="trAbout" id="trGenres" style="display: none">
                                <th scope="row" id="thOrigin" class="infobox-label thLabel thAbout coloredText">
                                    <p style="margin-top: 5px;">Genres</p>
                                </th>
                                <td class="infobox-data tdAbout">
                                    <ul runat="server" class="ulAboutSec" id="ulGenres">
                                    </ul>
                                </td>
                            </tr>
                            <tr runat="server" class="trAbout" id="trLabels" style="margin-top: -10px; display: none;">
                                <th scope="row" class="infobox-label thLabel thAbout coloredText">
                                    <p style="margin-top: 5px;">Labels</p>
                                </th>
                                <td class="infobox-data tdAbout">
                                    <ul runat="server" class="ulAbout" id="ulLabels">
                                        <li><a href="javascript:void(0)" title=""></a></li>
                                    </ul>
                                </td>
                            </tr>
                            <tr runat="server" class="trAbout" id="trSimilar" style="display: none;">
                                <th scope="row" class="infobox-label thLabel thAbout coloredText" style="">
                                    <p style="padding-top: -10px">Similar artists</p>
                                </th>
                                <td class="infobox-data tdAbout">
                                    <ul runat="server" class="ulAboutThr" id="ulSimilar">
                                    </ul>
                                </td>
                            </tr>
                            <tr runat="server" class="trAbout" id="trRelated" style="display: none;">
                                <th scope="row" class="infobox-label thLabel thAbout coloredText" style="">
                                    <p style="padding-top: -10px">Related artists</p>
                                </th>
                                <td class="infobox-data tdAbout">
                                    <ul runat="server" class="ulAboutThr" id="ulRelated">
                                    </ul>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div runat="server" id="divTopTracks" name="divTopTracks" class="topnav" style="display: none; font-size: 15px; padding-top: 2px; padding-bottom: 2px">
                    </div>
                    <div runat="server" id="divPlayer" style="visibility: visible;overflow-x: hidden;margin-bottom:-10px">
                        <div class="divProgressBar row">
                            <audio src="" id="player"></audio> 
                            <div id="progressAmountBack" class="hp_slide divProgress col-12" style="cursor: pointer">
                                <div id="progressAmount" class="hp_range coloredText" style="cursor: pointer"></div>
                            </div>
                        </div>
                        <div class="row divPlayerButtons" style="margin-top:2px">
                            <div id="butPrevTrack" class="divPrevTrackSec col-4" style="display: flex; justify-content: center;">
                                <a runat="server" id="aPrevTrack" href="javascript:void(0)" class="aPlayer coloredText" title="Previous" style="cursor: pointer; font-weight: bold; float: left"><i class="fa fa-angle-left"></i></a>
                            </div>
                            <div class="divPlayTrack col-4" style="display: flex; justify-content: center;">
                                <a runat="server" id="aPlayTrack" href="javascript:void(0)" class="aPlayer aPlay coloredText" title="Play" style="cursor: pointer; font-weight: bold; "><i class="fa fa-play"></i></a>
                                <a runat="server" id="aPauseTrack" href="javascript:void(0)" class="aPlayer aPause coloredText" title="Pause" style="display:none; cursor: pointer; font-weight: bold; "><i class="fa fa-pause"></i></a>
                            </div>
                            <div id="butNextTrack" class="divNextTrackSec col-4" style="display: flex; justify-content: center;">
                                <a runat="server" id="aNextTrack" href="javascript:void(0)" class="aPlayer coloredText" title="Next" style="cursor: pointer; font-weight: bold;"><i class="fa fa-angle-right"></i></a>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <div runat="server" id="divEditSection" name="divEditSection" class="container-fluid" style="display: none; width: 100%; float: left; padding-right: 50px; padding-left: 50px; margin-top: -44%">

            <div class="row">
                <div class="col-4">
                    <span runat="server" id="spanBndName" class="spanBndLabel modalSpanSecond">Name: </span>
                    <input runat="server" id="bndName" type="text" name="bndName" class="form-control inputFieldSecondary dark-mode-secondary-page bndDataField" placeholder="Name" style="display: inline-block; width: 80%" />
                    <input runat="server" id="bndID" type="text" name="bndID" class="form-control inputFieldSecondary dark-mode-secondary-page bndDataField" style="display: none" />

                    <div runat="server" id="bndLineAlias" class="bndDatLine">
                        <span runat="server" id="spanBndAlias" class="spanBndLabel modalSpanSecond">Other names: </span>
                        <input runat="server" id="bndAlias" type="text" name="BndAlias" class="form-control inputFieldSecondary dark-mode-secondary-page bndDataField" placeholder="Alias" style="display: inline-block; width: 65%" />
                    </div>
                    <div runat="server" id="bndLinePlaces" class="bndLinePlaces">
                        <span runat="server" id="labCountry" class="spanBndLabel modalSpanSecond">Country: </span>
                        <input runat="server" id="bndCountry" type="text" name="BndCountry" class="form-control inputFieldSecondary dark-mode-secondary-page bndDataField" style="display: inline-block; width: 78%;" placeholder="Country" />
                        <span runat="server" id="labCity" class="spanBndLabel modalSpanSecond">City: </span>
                        <input runat="server" id="bndCity" type="text" name="BndCity" class="form-control inputFieldSecondary dark-mode-secondary-page bndDataField" style="display: inline-block; width: 78%;" placeholder="City" />
                    </div>
                    <div runat="server" id="bndLineDates" class="devDates" style="display: inline-block; margin-top: 3px">
                        <span class="spanBndLabel modalSpanSecond">Start dates: </span>
                        <input runat="server" type="text" class="form-control inputFieldSecondary dark-mode-secondary-page" id="bndStartDates" name="bndStartDate" style="display: inline-block; width: 75%" />
                        <span class="spanBndLabel modalSpanSecond">End dates: </span>
                        <input runat="server" type="text" class="form-control inputFieldSecondary dark-mode-secondary-page" id="bndEndDates" name="bndEndDate" style="display: inline-block; width: 75%" />
                    </div>
                    <div runat="server" id="bndLineGenres" class="bndDatLine">
                        <span runat="server" id="spanBndGenres" class="spanBndLabel modalSpanSecond">Genres: </span>
                        <input runat="server" id="bndGenres" type="text" name="BndGenres" class="form-control inputFieldSecondary dark-mode-secondary-page bndDataField" placeholder="Genres" style="display: inline-block;" />
                    </div>
                </div>
                <div class="col-4" style="margin-left: -30px; margin-right: 30px">
                    <div runat="server" id="bndLineAbout" class="bndDatLine">
                        <span runat="server" id="BndAboutSpan" class="spanBndLabel modalSpanSecond">About: </span>
                        <asp:TextBox runat="server" ID="bndAbout" CssClass="scrollabletextbox" ReadOnly="false" TextMode="MultiLine" Rows="100" Style="font-size: 12px; height: 350px" />
                    </div>

                </div>
                <div class="col-4">
                    <div runat="server" id="bndLineURL" class="bndURLLine">
                    </div>
                </div>
            </div>
        </div>
        <div runat="server" id="divOtherContainers" class="d-flex flex-row" style="margin-top: 10px; margin-bottom: 10px; margin-left: 10px;">
        </div>

        <div runat="server" id="contentContainer" name="contentSection">
            <div runat="server" id="contentSection" name="contentSection" class="content" style="position: absolute; top: 170px;">
                <p runat="server" id="testString" style="display: none"></p>
                <p runat="server" id="testID" style="display: none"></p>
            </div>
        </div>

        <div runat="server" id="contentSection2" name="contentSection2" class="content" style="display: none; position: absolute; top: 190px;">
            <div runat="server" id="divContentSimilar" name="divContentSimilar" class="content" style="">
            </div>
            <div runat="server" id="divContentRelated" name="divContentRelated" class="content" style="display: none">
            </div>
            <div runat="server" id="divSimilarButtons" name="divContentRelated" class="content" style="display: none; position: fixed; bottom: 0; margin-top: -20px; right: 0">
                <input runat="server" id="inpAddSimilar" type="text" name="inpRefreshSimilar" class="form-control inputFieldSecondary dark-mode-secondary-page bndDataField" placeholder="Artist 1; Artist 2" style="display: none;" />
                <a runat="server" id="bndAddSimilar" class="btn btn-mini" title="Add similar artists" style="color: aliceblue; opacity: 0.4" href="javascript:void(0)"><i class="fa fa-plus" aria-hidden="true"></i></a>
                <a runat="server" id="bndDelSimilar" class="btn btn-mini" title="Delete similar artists" style="color: aliceblue; opacity: 0.4" href="javascript:void(0)"><i class="fa fa-minus" aria-hidden="true"></i></a>
                <a runat="server" id="bndRefreshSimilar" class="btn btn-mini" title="Refresh similar artists" style="color: aliceblue; opacity: 0.4" href="javascript:void(0)"><i class="fa fa-refresh" aria-hidden="true"></i></a>
            </div>
        </div>

        <div runat="server" id="subcontentContainer" class="" name="subcontentSection">
            <div runat="server" id="subcontentSection" name="subcontentSection" class="content scrollableItemsDiv" style="position: absolute; top: 140px;">
            </div>
        </div>

        <div class="editArtist" style="position: fixed; bottom: 0; margin-top: -20px; right: 0">
            <a runat="server" id="bndSave" class="btn btn-mini" title="Save" style="color: aliceblue; opacity: 0.4; display: none" href="javascript:void(0)"><i class="fa fa-check" aria-hidden="true"></i></a>
            <a runat="server" id="bndAddMember" class="btn btn-mini" title="Add" style="color: aliceblue; opacity: 0.4; display: none" href="javascript:void(0)"><i class="fa fa-plus" aria-hidden="true"></i></a>
        </div>
        <div id="artistDataModal" class="modal fade">
            <div id='modalArtistDataDiv' data-toggle='modal' data-target='#artistDataModal' runat="server"></div>
            <div id='artistModal' class="modal-dialog modal-dialog-centered modal-sm">
                <div id='subModalArtistData' class="modal-content" style="background-color: #121212; margin-left: -88%">
                    <iframe id="artistDataFrame" src="/Forms/ArtistData.aspx" scrolling="yes" style="min-height: 420px; height: 425px; width: 855px; border: none; border-radius: 10px"></iframe>
                </div>
            </div>
        </div>

        <div id="divGalleryContainer" class="modal fade">
            <div id='modalGalleryDataDiv' data-toggle='modal' data-target='#divGalleryContainer' runat="server"></div>
            <div id='divGalleryModal' class="modal-dialog modal-dialog-centered modal-sm">
                <div id='subModalGallery' class="modal-content" style="background-color: #121212; margin-left: -88%">
                    <iframe id="galleryFrame" src="/Forms/GalleryModal.aspx" scrolling="no" style="min-height: 700px; height: 700px; width: 900px; border: none; border-radius: 10px"></iframe>
                </div>
            </div>
        </div>
         <!--<a runat="server" id="bndEdit2" class="btn btn-mini" title="Edit" style="color: aliceblue; opacity: 0.4" href="javascript:void(0)"><i class="fa fa-pencil" aria-hidden="true"></i></a>
            <a runat="server" id="bndRefreshTop2" class="btn btn-mini" title="Refresh top tracks" style="color: aliceblue; opacity: 0.4" href="javascript:void(0)"><i class="fa fa-refresh" aria-hidden="true"></i></a>-->
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
