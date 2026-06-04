<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="GalleryModal.aspx.cs" Inherits="Aoide.Forms.GalleryModal" %>

<!DOCTYPE html>

<html xmlns="http://www.w3.org/1999/xhtml">
<head runat="server">
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous" />
    <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.6.1/css/font-awesome.min.css" rel="stylesheet" />
    <link href='https://fonts.googleapis.com/css?family=Lexend' rel='stylesheet' />
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdn.materialdesignicons.com/5.4.55/css/materialdesignicons.min.css" />
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkStyles2" href="~/Styles/Main.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkNavBar2" href="~/Styles/NavBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSectionBar2" href="~/Styles/SectionBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSlider2" href="~/Styles/splide-teal.min.css" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>Gallery</title>
</head>
<body>
    <form id="form1" runat="server">
        <div>
            <div class="playlistButtons" style="float: right;">
                <asp:Button ID="gallerySubmit" runat="server" Text="✔" CssClass="btn btn-mini" OnClick="submit_Click" Style="display: none; color: aliceblue; opacity: 0.4" />
            </div>
        </div>
        <div runat="server" id="divGalleryContent" name="divGalleryContent" class="container-fluid" style="width: 100%; height: 700px;">
            <img runat="server" id="imgBackGround" class="" src="/Images/System/folder-square.jpg" alt="galleryImage" style="margin-left: -49%; margin-top: -59%; height: 250%; position: absolute; z-index: -3; filter: blur(40px) brightness(40%)" />
            <div class="row divGalleryRow" style="display: flex; align-items: center; justify-content: center; height: 100%;">
                <div class="col-1 butPrevImage aBrowseImage" title="Previous" data-value="Previous" style="cursor: pointer; display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.4; z-index: 1">
                    <a runat="server" href="javascript:void(0)" class="butPrevImage coloredText" title="Previous" data-value="Previous" style="text-decoration: none; cursor: pointer; font-weight: bold; color: aliceblue; padding-top: 617px"><i class="fa fa-arrow-left"></i></a>
                </div>
                <div class="col-10" style="display: flex; align-items: center; justify-content: center; height: 100%;">
                    <a id="anchorMainImage" href="javascript:void(0)" target="_blank" style="cursor: pointer; text-decoration: none">
                        <img runat="server" id="imgMainImage" class="" src="/Images/System/folder-square.jpg" alt="galleryImage" style="max-height: 700px; max-width: 900px; z-index: -2" /></a>

                </div>
                <div class="col-1 butNextImage aBrowseImage" title="Next" data-value="Next" style="cursor: pointer; display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.4; z-index: 1">
                    <a runat="server" href="javascript:void(0)" class="butNextImage coloredText" title="Next" data-value="Next" style="text-decoration: none; cursor: pointer; font-weight: bold; color: aliceblue; padding-top: 617px"><i class="fa fa-arrow-right"></i></a>
                </div>
            </div>
            <div class="row divGalleryRow2" style="margin-top: -44%; padding: 20px; display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.6; z-index: -1">
                <p runat="server" id="pImageTitle" contenteditable="false" style="font-size: 20px; cursor: default"></p>
                <input runat="server" id="inpImagePaths" type="text" name="inpImagePaths" style="display: none" />
            </div>

        </div>
    </form>
    <script src="https://code.jquery.com/jquery-3.6.0.js" integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk=" crossorigin="anonymous"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="/JS/Navbar.js" type="text/javascript"></script>
    <script src="/JS/Registry.js" type="text/javascript"></script>
    <script src="/JS/SectionBar.js" type="text/javascript"></script>

    <script src="https://code.jquery.com/ui/1.12.1/jquery-ui.js" integrity="sha256-T0Vest3yCU7pafRw9r+settMBX6JkKN06dqBnpQ8d30=" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.9.0/js/bootstrap-datepicker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>

    <script>

        $('body').unbind('keyup').bind('keyup', function (event) {
            var key = event.keyCode || event.which;
            if (key === 37) {
                var strImagePaths = $("#inpImagePaths").val().split(';');
                var strCurrentPath = $("#imgMainImage").attr("src");

                for (var i = 0; i < strImagePaths.length; i++) {
                    if (strCurrentPath == strImagePaths[i]) {
                        if (i == 0) {
                            var strImageName = strImagePaths[strImagePaths.length - 1].substr(0, strImagePaths[strImagePaths.length - 1].lastIndexOf('.'));
                            strImageName = strImageName.substr(strImageName.lastIndexOf('/') + 1);
                            if (strImageName.indexOf(" Era ") >= 0) {
                                strImageName = strImageName.replaceAll("%27", "\'").substring(0, strImageName.lastIndexOf(" Era "));
                            }

                            else if (strImageName.indexOf("_") >= 0) {
                                strImageName = strImageName.replaceAll("%27", "\'").replaceAll("_H", "").replaceAll("_V", "");
                            }

                            $("#imgMainImage").attr("src", strImagePaths[strImagePaths.length - 1]);
                            $("#imgBackGround").attr("src", strImagePaths[strImagePaths.length - 1]);
                            $("#pImageTitle").text(strImageName.replaceAll("%20", " ").replaceAll(" Era", "").replace(/(\d{4})\..*?\./, "$1.").replaceAll(" Current", "").replaceAll("%2C", " -"));
                            $("#anchorMainImage").attr("href", strImagePaths[i - 1]);
                        }
                        else {
                            var strImageName = strImagePaths[i - 1].substr(0, strImagePaths[i - 1].lastIndexOf('.'));
                            strImageName = strImageName.substr(strImageName.lastIndexOf('/') + 1);
                            if (strImageName.indexOf(" Era ") >= 0) {
                                strImageName = strImageName.replaceAll("%27", "\'").substring(0, strImageName.lastIndexOf(" Era "));
                            }

                            else if (strImageName.indexOf("_") >= 0) {
                                strImageName = strImageName.replaceAll("%27", "\'").replaceAll("_H", "").replaceAll("_V", "");
                            }

                            $("#imgMainImage").attr("src", strImagePaths[i - 1]);
                            $("#imgBackGround").attr("src", strImagePaths[i - 1]);
                            $("#pImageTitle").text(strImageName.replaceAll("%20", " ").replaceAll(" Era", "").replace(/(\d{4})\..*?\./, "$1.").replaceAll(" Current", "").replaceAll("%2C", " -"));

                            $("#anchorMainImage").attr("href", strImagePaths[i - 1]);
                        }
                    }

                }
            }
            else if (key === 39) {
                var strImagePaths = $("#inpImagePaths").val().split(';');
                var strCurrentPath = $("#imgMainImage").attr("src");

                for (var i = 0; i < strImagePaths.length; i++) {
                    if (strCurrentPath == strImagePaths[i]) {
                        if (i == strImagePaths.length - 1) {
                            var strImageName = strImagePaths[0].substr(0, strImagePaths[0].lastIndexOf('.'));
                            strImageName = strImageName.substr(strImageName.lastIndexOf('/') + 1);
                            if (strImageName.indexOf(" Era ") >= 0) {
                                strImageName = strImageName.replaceAll("%27", "\'").substring(0, strImageName.lastIndexOf(" Era "));
                            }

                            else if (strImageName.indexOf("_") >= 0) {
                                strImageName = strImageName.replaceAll("%27", "\'").replaceAll("_H", "").replaceAll("_V", "");
                            }

                            $("#imgMainImage").attr("src", strImagePaths[0]);
                            $("#imgBackGround").attr("src", strImagePaths[0]);
                            $("#pImageTitle").text(strImageName.replaceAll("%20", " ").replaceAll(" Era", "").replace(/(\d{4})\..*?\./, "$1.").replaceAll(" Current", "").replaceAll("%2C", " -"));
                            $("#anchorMainImage").attr("href", strImagePaths[0]);
                        }
                        else {
                            var strImageName = strImagePaths[i + 1].substr(0, strImagePaths[i + 1].lastIndexOf('.'));
                            strImageName = strImageName.substr(strImageName.lastIndexOf('/') + 1);
                            if (strImageName.indexOf(" Era ") >= 0) {
                                strImageName = strImageName.replaceAll("%27", "\'").substring(0, strImageName.lastIndexOf(" Era "));
                            }

                            else if (strImageName.indexOf("_") >= 0) {
                                strImageName = strImageName.replaceAll("%27", "\'").replaceAll("_H", "").replaceAll("_V", "");
                            }

                            $("#imgMainImage").attr("src", strImagePaths[i + 1]);
                            $("#imgBackGround").attr("src", strImagePaths[i + 1]);
                            $("#pImageTitle").text(strImageName.replaceAll("%20", " ").replaceAll(" Era", "").replace(/(\d{4})\..*?\./, "$1.").replaceAll(" Current", "").replaceAll("%2C", " -"));

                            $("#anchorMainImage").attr("href", strImagePaths[i + 1]);
                        }
                    }
                }
            }
        });

        $(".aBrowseImage").on("click", function () {
            var strDirection = $(this).attr("data-value");
            var strImagePaths = $("#inpImagePaths").val().split(';');
            var strCurrentPath = $("#imgMainImage").attr("src");

            for (var i = 0; i < strImagePaths.length; i++) {
                if (strCurrentPath == strImagePaths[i] && strDirection == "Previous") {
                    if (i == 0) {
                        var strImageName = strImagePaths[strImagePaths.length - 1].substr(0, strImagePaths[strImagePaths.length - 1].lastIndexOf('.'));
                        strImageName = strImageName.substr(strImageName.lastIndexOf('/') + 1);
                        if (strImageName.indexOf(" Era ") >= 0) {
                            strImageName = strImageName.replaceAll("%27", "\'").substring(0, strImageName.lastIndexOf(" Era "));
                        }

                        else if (strImageName.indexOf("_") >= 0) {
                            strImageName = strImageName.replaceAll("%27", "\'").replaceAll("_H", "").replaceAll("_V", "");
                        }

                        $("#imgMainImage").attr("src", strImagePaths[strImagePaths.length - 1]);
                        $("#imgBackGround").attr("src", strImagePaths[strImagePaths.length - 1]);
                        $("#pImageTitle").text(strImageName.replaceAll("%20", " ").replaceAll(" Era", "").replace(/(\d{4})\..*?\./, "$1.").replaceAll(" Current", "").replaceAll("%2C", " -"));
                        $("#anchorMainImage").attr("href", strImagePaths[i - 1]);
                    }
                    else {
                        var strImageName = strImagePaths[i - 1].substr(0, strImagePaths[i - 1].lastIndexOf('.'));
                        strImageName = strImageName.substr(strImageName.lastIndexOf('/') + 1);
                        if (strImageName.indexOf(" Era ") >= 0) {
                            strImageName = strImageName.replaceAll("%27", "\'").substring(0, strImageName.lastIndexOf(" Era "));
                        }

                        else if (strImageName.indexOf("_") >= 0) {
                            strImageName = strImageName.replaceAll("%27", "\'").replaceAll("_H", "").replaceAll("_V", "");
                        }

                        $("#imgMainImage").attr("src", strImagePaths[i - 1]);
                        $("#imgBackGround").attr("src", strImagePaths[i - 1]);
                        $("#pImageTitle").text(strImageName.replaceAll("%20", " ").replaceAll(" Era", "").replace(/(\d{4})\..*?\./, "$1.").replaceAll(" Current", "").replaceAll("%2C", " -"));

                        $("#anchorMainImage").attr("href", strImagePaths[i - 1]);
                    }
                }

                else if (strCurrentPath == strImagePaths[i] && strDirection == "Next") {
                    if (i == strImagePaths.length - 1) {
                        var strImageName = strImagePaths[0].substr(0, strImagePaths[0].lastIndexOf('.'));
                        strImageName = strImageName.substr(strImageName.lastIndexOf('/') + 1);
                        if (strImageName.indexOf(" Era ") >= 0) {
                            strImageName = strImageName.replaceAll("%27", "\'").substring(0, strImageName.lastIndexOf(" Era "));
                        }

                        else if (strImageName.indexOf("_") >= 0) {
                            strImageName = strImageName.replaceAll("%27", "\'").replaceAll("_H", "").replaceAll("_V", "");
                        }

                        $("#imgMainImage").attr("src", strImagePaths[0]);
                        $("#imgBackGround").attr("src", strImagePaths[0]);
                        $("#pImageTitle").text(strImageName.replaceAll("%20", " ").replaceAll(" Era", "").replace(/(\d{4})\..*?\./, "$1.").replaceAll(" Current", "").replaceAll("%2C", " -"));
                        $("#anchorMainImage").attr("href", strImagePaths[0]);
                    }
                    else {
                        var strImageName = strImagePaths[i + 1].substr(0, strImagePaths[i + 1].lastIndexOf('.'));
                        strImageName = strImageName.substr(strImageName.lastIndexOf('/') + 1);
                        if (strImageName.indexOf(" Era ") >= 0) {
                            strImageName = strImageName.replaceAll("%27", "\'").substring(0, strImageName.lastIndexOf(" Era "));
                        }

                        else if (strImageName.indexOf("_") >= 0) {
                            strImageName = strImageName.replaceAll("%27", "\'").replaceAll("_H", "").replaceAll("_V", "");
                        }

                        $("#imgMainImage").attr("src", strImagePaths[i + 1]);
                        $("#imgBackGround").attr("src", strImagePaths[i + 1]);
                        $("#pImageTitle").text(strImageName.replaceAll("%20", " ").replaceAll(" Era", "").replace(/(\d{4})\..*?\./, "$1.").replaceAll(" Current", "").replaceAll("%2C", " -"));

                        $("#anchorMainImage").attr("href", strImagePaths[i + 1]);
                    }
                }
            }
        });

    </script>
</body>
</html>
